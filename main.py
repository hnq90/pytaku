import sys
sys.path.insert(0, 'lib')
import webapp2
from pytaku.api.api import RegisterHandler, LoginHandler, SeriesHandler,\
    SearchHandler, ChapterHandler, LogoutHandler, SeriesBookmarkHandler,\
    ChapterBookmarkHandler, ChapterProgressHandler, SettingsHandler,\
    ResetPasswordHandler, SetNewPasswordHandler

from pytaku.api.workers import FetchChapterWorker

from pytaku.routes.routes import AppOnlyRoute, HomeRoute, SeriesRoute,\
    ChapterRoute


app = webapp2.WSGIApplication([
    ('/api/register', RegisterHandler),
    ('/api/login', LoginHandler),
    ('/api/logout', LogoutHandler),
    ('/api/reset-password', ResetPasswordHandler),
    ('/api/set-new-password', SetNewPasswordHandler),
    ('/api/settings', SettingsHandler),
    ('/api/series', SeriesHandler),
    ('/api/chapter', ChapterHandler),
    ('/api/search', SearchHandler),
    ('/api/series-bookmark', SeriesBookmarkHandler),
    ('/api/chapter-bookmark', ChapterBookmarkHandler),
    ('/api/chapter-progress', ChapterProgressHandler),

    ('/', HomeRoute),
    ('/chapter/(.+)', ChapterRoute),
    ('/series/(.+)', SeriesRoute),
    ('/search/(.+)', HomeRoute),
    ('/reset-password/(.+)', AppOnlyRoute),
    ('/reset-password', AppOnlyRoute),
    ('/series-bookmarks', AppOnlyRoute),
    ('/chapter-bookmarks', AppOnlyRoute),
    ('/settings', AppOnlyRoute),
    ('/login', AppOnlyRoute),
    ('/register', AppOnlyRoute),

    ('/workers/fetch-chapter', FetchChapterWorker),
], debug=True)
