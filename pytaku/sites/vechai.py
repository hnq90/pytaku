# -*- coding: utf-8 -*-

__author__ = 'nampnq'
import re
from google.appengine.api import urlfetch

from pytaku.sites import Site
from bs4 import BeautifulSoup
from unidecode import unidecode
import json


# Define custom BeautifulSoup filter to get <a> tags that link to chapters
def _chapter_href(tag):
    if tag.name == 'a' and 'href' in tag.attrs:
        _page_url_pat = re.compile(
            '^http://doctruyen.vechai.info/.*-chap-\d+/$'
        )
        return (bool(_page_url_pat.match(tag.attrs['href']))
                and tag.text.strip() != '')
    return False


def _thumb_img(tag):
    return (tag.name == 'img'
            and tag.attrs['src'].startswith('http://i.vechai.info/img/'))


class Vechai(Site):

    netlocs = ['doctruyen.vechai.info', 'vechai.info']

    def search_series(self, keyword):
        url = 'http://vechai.info/search/items.js'
        urlfetch.set_default_fetch_deadline(60)
        resp = urlfetch.fetch(url)
        if resp.status_code != 200:
            return []

        # resp.content is a javascript array declaration:
        # var items = [["Series name", "http://series/url"], ...];
        content = resp.content
        if content.startswith('var items='):
            content = content[10:]
        if content.endswith(';'):
            content = content[:-1]
        results = json.loads(content)

        returns = []

        for r in results:
            title = unidecode(r[0])
            if keyword.lower() in title.lower():
                returns.append({
                    'name': r[0],
                    'url': r[1],
                    'site': 'vechai',
                })
        return returns

    def series_info(self, html):
        soup = BeautifulSoup(html)

        name = soup.find('title').text.split(' - ')[0]
        thumb_img = soup.find('img', class_='insertimage')
        if thumb_img is None:
            thumb_img = soup.find('div', id='zoomtext').find(_thumb_img)

        thumb_url = thumb_img.attrs['src']
        description = []

        chapter_hrefs = soup.find_all(_chapter_href)
        chapters = [{'url': a['href'], 'name': a.text.strip()}
                    for a in chapter_hrefs]

        return {
            'name': name,
            'chapters': chapters,
            'tags': [],
            'status': 'n/a',
            'description': description,
            'thumb_url': thumb_url,
            'site': 'vitaku',
            'authors': [],
        }

    def chapter_info(self, html):
        soup = BeautifulSoup(html)

        # One Piece - Đọc truyện tranh One Piece chapter 664 - Vitaku
        name = soup.find('title').text.split(' | ')[0].strip()
        if name.startswith(u'Đọc truyện'):
            name = name[len(u'Đọc truyện'):]

        page = soup.find('div', class_='entry2').find('p')
        page_imgs = page.find_all('img')
        pages = [img['src'] for img in page_imgs]

        # find prev_page or next_page by decrease or increase chapter number
        chap_url = soup.find('link', rel='canonical')['href']
        chap_info = chap_url.split('/')[-2]
        # Structure chap (.*)-chap-(\d+)
        chap_name, chap_num = re.match('(.*)-chap-(\d+)', chap_info).groups()

        base = 'http://doctruyen.vechai.info/%s-chap-%s/'
        prev = base % (chap_name, 0 if int(chap_num) < 2 else int(chap_num)-1)
        next = base % (chap_name, int(chap_num)+1)

        return {
            'name': name,
            'pages': pages,
            'prev_chapter_url': prev,
            'next_chapter_url': next,
            'series_url': 'http://vechai.info/%s' % chap_name,
        }
