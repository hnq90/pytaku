from threading import Thread
import traceback
from Queue import Queue
from collections import deque
import webapp2
from google.appengine.api import mail, taskqueue
from google.appengine.api.app_identity import get_application_id
from pytaku.models import User, createUser, Chapter, Series, ChapterProgress
from pytaku import sites
from pytaku.controllers import create_or_get_series, create_or_get_chapter
from decorators import wrap_json, unpack_post, unpack_get, auth
from exceptions import PyError
from token import gen_token
from unidecode import unidecode


class LoginHandler(webapp2.RequestHandler):

    @wrap_json
    @unpack_post(email=['ustring', 'email'],
                 password=['ustring'],
                 remember=['boolean'])
    def post(self):
        email = self.data['email']
        password = self.data['password']
        user = User.auth_with_password(email, password)
        expires = not self.data['remember']

        if user:
            return {
                'token': gen_token(user, expires=expires),
                'settings': user.settings,
            }
        else:
            raise PyError({'msg': 'invalid_password'})


class LogoutHandler(webapp2.RequestHandler):

    @wrap_json
    @auth()
    def post(self):
        self.user.logout()
        return {}


class ResetPasswordHandler(webapp2.RequestHandler):

    @wrap_json
    @unpack_post(email=['ustring', 'email'])
    def post(self):
        email = self.data['email']
        token = User.generate_reset_password_token(email)
        if token is None:
            raise PyError({'msg': 'email_not_found'})

        # Email password reset token to user
        app_name = get_application_id()
        sender = 'noreply@%s.appspotmail.com' % app_name
        subject = '%s password reset' % app_name.capitalize()
        body = """
A password reset has been requested for your account. If you did not request
it, simply ignore this email, otherwise visit this link to reset your password:

https://%s.appspot.com/reset-password/%s
        """ % (app_name, token)
        mail.send_mail(sender, email, subject, body)
        return {'msg': 'reset_link_sent'}


class SetNewPasswordHandler(webapp2.RequestHandler):

    @wrap_json
    @unpack_post(token=['ustring'], password=['ustring'])
    def post(self):
        success = User.set_new_password(self.data['token'],
                                        self.data['password'])
        if not success:
            raise PyError({'msg': 'invalid_token'})

        return {'msg': 'password_updated'}


class RegisterHandler(webapp2.RequestHandler):

    @wrap_json
    @unpack_post(email=['ustring', 'email'],
                 password=['ustring'],
                 remember=['boolean'])
    def post(self):
        email = self.data['email']
        password = self.data['password']
        expires = not self.data['remember']

        new_user = createUser(email, password)
        if new_user is None:
            raise PyError({'msg': 'existing_email'})

        return {
            'token': gen_token(new_user, expires=expires),
            'settings': new_user.settings,
        }


class SettingsHandler(webapp2.RequestHandler):

    @wrap_json
    @auth()
    def get(self):
        return self.user.settings

    @wrap_json
    @auth()
    @unpack_post(language=['ustring', 'urlencoded'],
                 enable_shortcut=['boolean'])
    def post(self):
        language = self.data['language']
        enable_shortcut = self.data['enable_shortcut']
        changed_fields = []

        if language not in ('en', 'vi'):
            # TODO: refactor out hardcoded supported language list
            raise PyError({'msg': 'unsupported_language'})

        for field in ('language', 'enable_shortcut'):
            if getattr(self.user, field) != locals()[field]:
                changed_fields.append(field)

        self.user.language = language
        self.user.enable_shortcut = enable_shortcut
        self.user.put()
        return {
            'changed_fields': changed_fields,
        }


class SeriesHandler(webapp2.RequestHandler):

    def _fetch_first_chapter(self, chapters):
        if len(chapters) > 0:
            taskqueue.add(queue_name='fetch-chapter',
                          url='/workers/fetch-chapter',
                          params={'url': chapters[-1]['url']})

    @wrap_json
    @auth(required=False)
    @unpack_get(url=['ustring', 'urlencoded'], only_unread=['boolean'])
    def get(self):

        series = create_or_get_series(self.data['url'])

        resp = {
            field: getattr(series, field)
            for field in ('site', 'name', 'thumb_url', 'tags', 'status',
                          'description', 'authors', 'chapters')
        }

        if not hasattr(self, 'user'):
            self._fetch_first_chapter(resp['chapters'])
            return resp

        # tell if this series is in their bookmarks
        resp['is_bookmarked'] = series.is_bookmarked_by(self.user)

        # insert user's reading progress into each chapter too
        progresses = ChapterProgress.get_by_series_url(self.user.key.id(),
                                                       self.data['url'])

        # Only show chapters that come after the latest "finished" chapter, or
        # starting from the latest "reading" chapter, whichever comes last.
        if self.data['only_unread']:
            shown_chapters = deque(maxlen=6)

            for chap in resp['chapters']:

                if chap['url'] in progresses:
                    chap['progress'] = progresses[chap['url']]
                    if chap['progress'] == 'finished':
                        break
                    elif chap['progress'] == 'reading':
                        shown_chapters.append(chap)
                        break

                else:
                    chap['progress'] = 'unread'

                shown_chapters.append(chap)

            resp['chapters'] = list(shown_chapters)

        # Show all chapters:
        else:
            for chap in resp['chapters']:
                if chap['url'] in progresses:
                    chap['progress'] = progresses[chap['url']]
                else:
                    chap['progress'] = 'unread'

        self._fetch_first_chapter(resp['chapters'])
        return resp


class SearchHandler(webapp2.RequestHandler):

    @wrap_json
    @unpack_get(keyword=['ustring'], type=['ustring'])
    def get(self):
        keyword = self.data['keyword']
        type = self.data['type']
        search_results = {}  # {order: [series, series, ...]}

        if type == 'name':  # search by series name
            func_name = 'search_series'
        elif type == 'author':  # search by author name
            func_name = 'search_by_author'
        else:
            raise PyError('invalid_type')

        def _search(queue):
            keyword, site, order = queue.get()
            search_func = getattr(site, func_name)
            try:
                series_list = search_func(unidecode(keyword))
                search_results[order] = series_list
            except Exception:
                print traceback.format_exc()
                search_results[order] = []
            queue.task_done()

        q = Queue()

        for order, site in enumerate(sites.available_sites):
            q.put((keyword, site, order))
            worker = Thread(target=_search, args=(q,))
            worker.setDaemon(True)
            worker.start()

        q.join()

        # Get ordered list of series results
        series = []
        for i in sorted(search_results):
            series.extend(search_results[i])
        return series


class ChapterHandler(webapp2.RequestHandler):

    @wrap_json
    @auth(required=False)
    @unpack_get(url=['ustring', 'urlencoded'])
    def get(self):
        chapter = create_or_get_chapter(self.data['url'])

        resp = {
            'name': chapter.name,
            'url': chapter.url,
            'pages': chapter.pages,
            'series_url': chapter.series_url,
            'series_name': chapter.series_name,
            'next_chapter_url': chapter.next_chapter_url,
            'prev_chapter_url': chapter.prev_chapter_url,
        }

        if hasattr(self, 'user'):
            user = self.user
            resp['is_bookmarked'] = chapter.is_bookmarked(user)
            resp['progress'] = self.user.chapter_progress(resp['url'])

        # Fetch next chapter in background
        next_url = resp['next_chapter_url']
        if next_url is not None:
            taskqueue.add(queue_name='fetch-chapter',
                          url='/workers/fetch-chapter',
                          params={'url': next_url})
        return resp


class SeriesBookmarkHandler(webapp2.RequestHandler):

    @wrap_json
    @auth()
    def get(self):
        series = [create_or_get_series(url, no_update=True)
                  for url in self.user.bookmarked_series]
        return [{
            'site': s.site,
            'name': s.name,
            'url': s.url,
            'thumb_url': s.thumb_url,
        } for s in series]

    @wrap_json
    @unpack_post(url=['ustring'], action=['ustring'])
    @auth()
    def post(self):
        "Add or remove series from provided URL to bookmark list"

        if self.data['action'] not in ('add', 'remove'):
            raise PyError({'msg': 'invalid_action'})

        series = Series.get_by_url(self.data['url'])
        if series is None:
            raise PyError({'msg': 'series_not_created'})

        if self.data['action'] == 'add':
            if not self.user.bookmark_series(series):
                raise PyError({'msg': 'series_already_bookmarked'})
            return {}

        else:
            if not self.user.unbookmark_series(series):
                raise PyError({'msg': 'series_not_bookmarked'})
            return {}


class ChapterBookmarkHandler(webapp2.RequestHandler):

    @wrap_json
    @auth()
    def get(self):
        chapters = [create_or_get_chapter(url)
                    for url in self.user.bookmarked_chapters]
        return [{
            'series_url': chapter.series_url,
            'series_name': chapter.series_name,
            'name': chapter.name,
            'url': chapter.url,
        } for chapter in chapters]

    @wrap_json
    @unpack_post(url=['ustring'], action=['ustring'])
    @auth()
    def post(self):
        "Add or remove chapter from provided URL to bookmark list"

        if self.data['action'] not in ('add', 'remove'):
            raise PyError({'msg': 'invalid_action'})

        chapter = Chapter.get_by_url(self.data['url'])
        if chapter is None:
            raise PyError({'msg': 'chapter_not_created'})

        if self.data['action'] == 'add':
            if not self.user.bookmark_chapter(chapter):
                raise PyError({'msg': 'chapter_already_bookmarked'})
            return {}

        else:
            if not self.user.unbookmark_chapter(chapter):
                raise PyError({'msg': 'chapter_not_bookmarked'})
            return {}


class ChapterProgressHandler(webapp2.RequestHandler):

    @wrap_json
    @unpack_post(url=['ustring'], progress=['ustring'])
    @auth()
    def post(self):
        url = self.data['url']
        progress = self.data['progress']

        chapter = Chapter.get_by_url(url)
        if chapter is None:
            raise PyError('nonexistent_chapter')

        ChapterProgress.set_progress(self.user.key.id(), progress,
                                     chapter.url, chapter.series_url)
        return {}
