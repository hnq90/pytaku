/** @jsx React.DOM */
var RouteMixin = require('../mixins/route.jsx');
var HasShortcutMixin = require('../mixins/has_shortcut.jsx');
var Loading = require('../shared_components/loading.jsx');
var Alert = require('../shared_components/alert.jsx');
var store = require('../store.js');
var echo = require('../languages/index.js').echo;
var shortcut = require('../keyboard_shortcuts.jsx');
var SeriesBookMarks = require('./series_bookmarks.jsx');
var getCachedBS = SeriesBookMarks.getCachedSeries;
var setCachedBS = SeriesBookMarks.setCachedSeries;

var BookmarkButton = React.createClass({
    getInitialState: function() {
        return {processing: false};
    },

    render: function() {
        var info = this.props.info;
        var bookmarkBtn = <span></span>;

        if (info.hasOwnProperty('is_bookmarked')) {

            if (this.state && this.state.processing === true) {
                bookmarkBtn = (
                    <button className="btn btn-danger" disabled="disabled">
                        <i className='fa fa-lg fa-spinner fa-spin'></i> {echo('processing')}...
                    </button>
                );

            } else if (info.is_bookmarked) {
                bookmarkBtn = (
                    <button className="btn btn-danger" onClick={this.removeBookmark}
                        id="bookmark-btn">
                        <i className='fa fa-lg fa-ban'></i> {echo('unbookmark')}
                    </button>
                );

            } else {
                bookmarkBtn = (
                    <button className="btn btn-success" onClick={this.addBookmark}
                        id="bookmark-btn">
                        <i className='fa fa-bookmark'></i> {echo('bookmark')}
                    </button>
                );
            }
        }
        return bookmarkBtn;
    },

    addBookmark: function() {
        this.bookmark('add');
    },

    removeBookmark: function() {
        this.bookmark('remove');
    },

    bookmark: function(action) {
        this.setState({
            processing: true
        });
        var self = this;
        this.props.ajax({
            url: '/api/chapter-bookmark',
            method: 'POST',
            data: JSON.stringify({
                url: self.props.info.url,
                action: action
            }),

            success: function() {
                info = self.props.info;
                if (action == 'add') {
                    info.is_bookmarked = true;
                } else {
                    info.is_bookmarked = false;
                }
                var key = 'chapter_' + info.url;
                store.set('chapter_' + info.url, info);
                self.props.setState({info: info});
            },

            complete: function() {
                self.setState({
                    processing: false
                });
            }
        });
    },
});

var Pages = React.createClass({

    // Max number of pages to load concurrently
    NUM_CONCURRENT: 3,

    getInitialState: function() {
        return {
            loaded: [],
        };
    },

    componentWillReceiveProps: function(nextProps) {

        if (nextProps.imgs.length > 0) {

            // Leave pages as-is if already rendered
            var loaded = this.state.loaded;
            if (loaded.length > 0 && loaded[0] === nextProps.imgs[0]) {
                return;
            }

            // Render first image which has an onLoad event handler which
            // renders the second image which has an onload event handler to
            // render the third image... and so on.
            this.setState({
                loaded: nextProps.imgs.slice(0, this.NUM_CONCURRENT),
            });

        } else {
            // Clean up when changed to another chapter
            this.setState({
                loaded: [],
            });
        }
    },

    render: function() {
        var all = this.props.imgs;
        var loaded = this.state.loaded;
        var self = this;

        var images = loaded.map(function(url, index) {

            // function to append the next NUM_CONCURRENT images into the DOM
            // when this image has finished loading:
            var appendFunc = function() {
                for (var i = 1, len = self.NUM_CONCURRENT; i <= len; i++) {
                    var nextIndex = index + i;
                    var nextImgUrl = all[nextIndex];

                    if (nextIndex < all.length) {
                        if(loaded.indexOf(nextImgUrl) === -1) {
                            loaded.push(nextImgUrl);
                        }
                    } else {
                        break;
                    }
                }

                self.setState({loaded: loaded});
            };
            return (
                <img className="page-img" key={url + index} src={url}
                    onLoad={appendFunc} />
            );
        });
        return (
            <div>
                {images}
                <Loading loading={all.length > loaded.length} />
            </div>
        );
    }
});

module.exports = React.createClass({
    mixins: [RouteMixin, HasShortcutMixin],
    pageTitle: function() {
        if (!this.state.info.name) {
            return echo('loading_chapter_info');
        }
        return this.state.info.name + ' - ' + this.state.info.series_name ;
    },

    render: function() {
        var info = this.state.info;
        var name = info.name;
        var next = info.next_chapter_url;
        var prev = info.prev_chapter_url;
        var fetching = this.state.fetching;

        var pages = <Pages imgs={info.pages} />;

        var setState = this.setState.bind(this);
        var setProgress = this.setProgress;

        var body;
        if (this.state.errorMsg) {
            return (
                <div className="chapter-container">
                    <Alert msg={echo(this.state.errorMsg)} />
                </div>
            );
        }

        return (
            <div className="chapter-container">
                <h2 className="chapter-name">{name}</h2>
                <div>

                    <ActionBar info={info} ajax={this.props.ajax} setState={setState}
                        updatingProgress={this.state.updatingProgress}
                        loggedIn={this.props.loggedIn}
                        setProgress={setProgress} />

                    <Loading loading={fetching} />

                    {pages}

                    <ActionBar info={info} ajax={this.props.ajax} setState={setState}
                        updatingProgress={this.state.updatingProgress}
                        loggedIn={this.props.loggedIn}
                        setProgress={setProgress} />

                </div>
                {this.renderBindings()}
            </div>
        );
    },

    componentWillReceiveProps: function(nextProps) {
        this.fetchPages(nextProps.url);
    },

    componentDidMount: function() {
        bindKeyboardShortcuts.apply(this);
        this.fetchPages(this.props.url);
    },

    getInitialState: function() {
        return {
            info: {
                pages: [],
                name: '',
                series_name: '',
                next_chapter_url: null,
                prev_chapter_url: null,
            },
            fetching: true,
            processingBookmark: false,
        };
    },

    fetchPages: function(url) {
        var newState = this.state;
        newState.info.pages = [];
        newState.fetching = true;
        this.setState(newState);

        cachedData = store.get('chapter_' + url);
        if (cachedData !== null) {
            this.updateChapterData(cachedData);
            this.startProgressTimer();
            return;
        }

        var self = this;
        this.props.ajax({
            url: '/api/chapter?url=' + encodeURIComponent(url),
            dataType: 'json',
            method: 'GET',
            success: function(data) {
                store.set('chapter_' + url, data);
                self.updateChapterData(data);
                self.startProgressTimer();
            },
            error: function(data) {
                self.setState({
                    errorMsg: data.responseJSON.msg
                });
            },
            complete: function() {
                self.setState({fetching: false});
            }
        });
    },

    updateChapterData: function(data) {
        this.setState({
            info: data,
            fetching: false,
        });
    },

    startProgressTimer: function() {
        var progress = this.state.info.progress;
        if (!this.props.loggedIn || (progress === 'finished' || progress === 'reading')) {
            return;
        }
        var self = this;
        var initialUrl = window.location.href;

        var delay = 2000;  // TODO: make this configurable
        setTimeout(function() {
            // Make sure user is still reading this page before doing anything
            if (initialUrl === window.location.href) {
                self.setProgress('reading');
                self.setFinishedOnReachBottom();
            }
        }, delay);
    },

    _finishedOnReachBottomIsSet: false,
    setFinishedOnReachBottom: function() {
        // As the name suggests: set chapter progress as "finished" when user
        // scrolls to bottom of page
        if (this._finishedOnReachBottomIsSet) {
            return;
        }
        var self = this;
        window.onscroll = function(ev) {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
                self.setProgress('finished');
            }
        };
        this._finishedOnReachBottomIsSet = true;
    },

    setProgress: function(progress) {
        if (this.state.info.progress === progress) {
            return;
        }

        this.setState({updatingProgress: true});

        var url = this.props.url;
        var self = this;
        this.props.ajax({
            url: '/api/chapter-progress',
            data: JSON.stringify({
                url: url,
                progress: progress,
            }),
            dataType: 'json',
            method: 'POST',
            success: function(data) {
                var info = self.state.info;

                // Update existing cached chapter info
                cachedChapter = info;
                cachedChapter.progress = progress;
                store.set('chapter_' + url, cachedChapter);
                self.updateChapterData(cachedChapter);

                // Update in series route too
                // XXX: it's reaaaally wasteful to load and rewrite the whole
                // series' info just to update a chapter... but it's easier
                // this way so...
                var cachedSeries = store.get('series_' + info.series_url);
                if (cachedSeries) {
                    for (var i=0; i < cachedSeries.chapters.length; i++) {
                        var chap = cachedSeries.chapters[i];
                        if (chap.url == self.props.url) {
                            chap.progress = progress;
                            break;
                        }
                    }
                    store.set('series_' + info.series_url, cachedSeries);
                }

                // Update in "bookmarked series" route too
                // XXX: We should really implement a proper client-side model
                // store to get rid of all this manual, repetitive cache
                // updating. Facebook's flux could be it, I guess.
                var cachedBS = getCachedBS(info.series_url);
                if (!cachedBS) {
                    return;
                }

                for (var i=0; i < cachedBS.chapters.length; i++) {
                    var chap = cachedBS.chapters[i];
                    if (chap.url == self.props.url) {
                        chap.progress = progress;
                        break;
                    }
                }
                setCachedBS(info.series_url, cachedBS);
            },
            error: function(err) {
                console.log('error while setting progress:', err);
            },
            complete: function() {
                self.setState({updatingProgress: false});
            },
        });
    }
});

var ProgressButton = React.createClass({
    render: function() {
        var progress = this.props.progress;

        if (this.props.loggedIn !== true) {
            return <span></span>;

        } else if (this.props.updating === true) {
            return (
                <button className="btn btn-danger" disabled="disabled">
                    <i className='fa fa-spinner fa-spin'></i> {echo('updating')}
                </button>
            );

        } else if (typeof progress === 'undefined' || progress === 'unread') {
            return (
                <button className="btn btn-primary" onClick={this.rotateProgress}>
                    <i className='fa fa-eye'></i> {echo('unread')}
                </button>
            );

        } else if (progress === 'reading') {
            return (
                <button className="btn btn-info" onClick={this.rotateProgress}>
                    <i className='fa fa-eye'></i> {echo('reading')}
                </button>
            );

        } else if (progress === 'finished') {
            return (
                <button className="btn btn-default" onClick={this.rotateProgress}>
                    <i className='fa fa-eye'></i> {echo('finished')}
                </button>
            );
        } else {
            return (
                <button className="btn btn-info" onClick={this.rotateProgress}>
                    ERROR!
                </button>
            );
        }
    },

    rotateProgress: function() {
        // unread -> reading -> finished -> unread -> ...
        var nextProgress;
        switch (this.props.progress) {
            case 'reading':
                nextProgress = 'finished';
                break;
            case 'finished':
                nextProgress = 'unread';
                break;
            default:  // "unread" or undefined
                nextProgress = 'reading';
                break;
        }
        this.props.setProgress(nextProgress);
    },
});

var ActionBar = React.createClass({
    render: function() {
        var prevBtn = '';
        var nextBtn = '';
        var seriesBtn = '';

        var info = this.props.info;
        var prev = info.prev_chapter_url;
        var next = info.next_chapter_url;
        var series = info.series_url;

        if (prev !== null) {
            prev = '/chapter/' + encodeURIComponent(prev);
            prevBtn =(
                <a href={prev} className="btn btn-primary" id="prev-btn">
                    <i className="fa fa-lg fa-angle-double-left"></i> {echo('prev')}
                </a>
            );
        }

        if (next !== null) {
            next = '/chapter/' + encodeURIComponent(next);
            nextBtn =(
                <a href={next} className="btn btn-primary" id="next-btn">
                    {echo('next')} <i className="fa fa-lg fa-angle-double-right"></i>
                </a>
            );
        }

        series = '/series/' + encodeURIComponent(series);
        seriesBtn =(
            <a href={series} className="btn btn-info" id="chapter-list-btn">
                <i className="fa fa-lg fa-angle-double-up"></i> {echo('chapter_list')}
            </a>
        );

        var bookmarkBtn = <BookmarkButton info={info} ajax={this.props.ajax}
            setState={this.props.setState} />;

        var progressBtn = <ProgressButton loggedIn={this.props.loggedIn}
            updating={this.props.updatingProgress}
            progress={info.progress} setProgress={this.props.setProgress} />;

        return (
            <div className="chapter-navs  btn-group">
                {prevBtn} {seriesBtn} {progressBtn} {bookmarkBtn} {nextBtn}
            </div>
        );
    },
});


/*
 * HERE BE DRAGONS !!
 * (translation: ugly shit follows)
 *
 * The following code assigns keyboard shortcuts to certain actions by
 * emulating click events on buttons, which are queried using jQuery, which is
 * most likely less performant than a proper react-based implementation. I
 * haven't come up with a clean way to do that, so for now I'll have to make do
 * with dragons. Sue me.
 */

var bindKeyboardShortcuts = function() {
    if (!shortcut.isEnabled()) {
        return;
    }

    // UpDownLeftRight / kjhl / wsad

    this.bindShortcut('scroll_up', ['k', 'w'], function() {
        window.scrollBy(0, -100);
    });

    this.bindShortcut('scroll_down', ['j', 's'], function() {
        window.scrollBy(0, 100);
    });

    this.bindShortcut('to_previous_chapter', ['left', 'h', 'a'], function() {
        $('#prev-btn').trigger('click');
    });

    this.bindShortcut('to_next_chapter', ['right', 'l', 'd'], function() {
        $('#next-btn').trigger('click');
    });

    this.bindShortcut('bookmark', 'b', function() {
        $('#bookmark-btn').trigger('click');
    });

    this.bindShortcut('to_chapter_list', 'u', function() {
        $('#chapter-list-btn').trigger('click');
    });
};
