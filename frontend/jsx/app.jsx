/** @jsx React.DOM */
var EasterEgg = require('./easter_egg.jsx');
var Chapter = require('./routes/chapter.jsx');
var Home = require('./routes/home.jsx');
var Login = require('./routes/login.jsx');
var SeriesBookmarks = require('./routes/series_bookmarks.jsx');
var ChapterBookmarks = require('./routes/chapter_bookmarks.jsx');
var Register = require('./routes/register.jsx');
var Search = require('./routes/search.jsx');
var Series = require('./routes/series.jsx');
var Navbar = require('./navbar.jsx');
var Settings = require('./routes/settings.jsx');
var ResetPassword = require('./routes/reset_password.jsx');
var ScrollToTopBtn = require('./scroll_to_top.jsx');
var lang = require('./languages/index.js');

var HOME = 'home',
    REGISTER = 'register',
    LOGIN = 'login',
    SEARCH = 'search',
    SERIES = 'series',
    CHAPTER = 'chapter',
    RESETPW = 'reset-password',
    SBOOKMARKS = 'series-bookmarks',
    CBOOKMARKS = 'chapter-bookmarks',
    SETTINGS = 'settings';

// Expose Director's router object for use later in the href click hijack
// script. Somewhat ugly, but hey, as long as it works, right?
var router;

var PytakuApp = React.createClass({
    componentDidMount: function() {
        var setState = this.setState;
        var self = this;
        router = Router({
            '/': setState.bind(this, {route: HOME}),
            '/register': setState.bind(this, {route: REGISTER}),
            '/login': setState.bind(this, {route: LOGIN}),
            '/series-bookmarks': setState.bind(this, {route: SBOOKMARKS}),
            '/chapter-bookmarks': setState.bind(this, {route: CBOOKMARKS}),
            '/settings': setState.bind(this, {route: SETTINGS}),
            '/search': setState.bind(this, {route: SEARCH}),

            '/search/:type/(.*)': (function() {
                return function(type, query) {
                    self.setState({
                        route: SEARCH,
                        type: type,
                        query: decodeURIComponent(query)
                    });
                };
            })(),

            '/series/(.+)': (function() {
                return function(url) {
                    self.setState({
                        route: SERIES,
                        url: decodeURIComponent(url)
                    });
                };
            })(),

            '/chapter/(.+)': (function() {
                return function(url) {
                    self.setState({
                        route: CHAPTER,
                        url: decodeURIComponent(url)
                    });
                };
            })(),

            '/reset-password': setState.bind(this, {route: RESETPW}),
            '/reset-password/(.+)': (function() {
                return function(token) {
                    self.setState({
                        route: RESETPW,
                        token: token,
                    });
                };
            })(),

        }).configure({html5history: true});

        router.init();
    },

    getInitialState: function() {
        var email = localStorage.getItem('email');
        var token = localStorage.getItem('token');
        var loggedIn = (typeof(email) === 'string' &&
                        typeof(token) === 'string');

        if (loggedIn === true) {
            var self = this;

            // Check if credentials stored on client are still valid by trying
            // to get user's settings.
            self.authedAjax({
                url: '/api/settings',
                success: function(data) {

                    if (lang.chosen !== data.language) {
                        lang.set(data.language);
                    }

                },
                error: function() {
                    localStorage.removeItem('token');
                    localStorage.removeItem('email');
                    self.setState({loggedIn: false});
                },
            });
        }
        return {
            route: HOME,
            loggedIn: loggedIn,
            email: email
        };
    },

    render: function() {
        var routeComponent;
        switch (this.state.route) {
            case REGISTER:
                routeComponent = <Register loggedIn={this.state.loggedIn}
                    setLoggedIn={this.setLoggedInFunc()} />;
                break;
            case LOGIN:
                routeComponent = <Login loggedIn={this.state.loggedIn}
                    setLoggedIn={this.setLoggedInFunc()} />;
                break;
            case SEARCH:
                routeComponent = <Search loggedIn={this.state.loggedIn}
                    query={this.state.query} type={this.state.type}
                    ajax={this.ajax} router={router} />;
                break;
            case SETTINGS:
                routeComponent = <Settings loggedIn={this.state.loggedIn}
                    ajax={this.ajax} />;
                break;
            case SERIES:
                routeComponent = <Series loggedIn={this.state.loggedIn}
                    url={this.state.url} ajax={this.ajax} />;
                break;
            case CHAPTER:
                routeComponent = <Chapter url={this.state.url}
                    loggedIn={this.state.loggedIn} ajax={this.ajax} />;
                break;
            case SBOOKMARKS:
                routeComponent = <SeriesBookmarks loggedIn={this.state.loggedIn}
                    ajax={this.ajax} />;
                break;
            case CBOOKMARKS:
                routeComponent = <ChapterBookmarks loggedIn={this.state.loggedIn}
                    ajax={this.ajax} />;
                break;
            case RESETPW:
                if (this.state.token) {
                    var Reset = ResetPassword.Reset;
                    routeComponent = <Reset token={this.state.token}
                        ajax={this.ajax} />;
                } else {
                    var Request = ResetPassword.Request;
                    routeComponent = <Request ajax={this.ajax} />;
                }
                break;
            default:
                routeComponent = <Home />;
        }
        return (
            <div>
                <Navbar loggedIn={this.state.loggedIn}
                    logout={this.logoutFunc()}
                    email={this.state.email}
                    route={this.state.route}
                />
                {routeComponent}
                <EasterEgg url={this.state.url} />
            </div>
        );
    },

    /********************************
     * Auth-related functionalities *
     ********************************/

    setLoggedInFunc: function() {
        var self = this;
        return function(email, token) {
            localStorage.setItem('email', email);
            localStorage.setItem('token', token);
            sessionStorage.clear();
            self.setState({
                loggedIn: true,
                email: email,
            });
        };
    },

    logoutFunc: function() {
        var self = this;
        return function() {
            self.authedAjax({
                url: '/api/logout',
                method: 'POST'
            });
            localStorage.removeItem('email');
            localStorage.removeItem('token');
            sessionStorage.clear();
            self.setState({loggedIn: false});
        };
    },

    authedAjax: function(options) {
        var token = localStorage.getItem('token');
        options.dataType = 'json';
        options.headers = {
            'X-Token': token
        };
        return $.ajax(options);
    },

    normalAjax: function(options) {
        options.dataType = 'json';
        return $.ajax(options);
    },

    ajax: function(options) {
        var self=this;
        if (self.state.loggedIn) {
            return self.authedAjax(options);
        } else {
            return self.normalAjax(options);
        }
    }
});

React.render(<PytakuApp />, document.getElementById('app'));

// "Go to top" button.
// Only show this on non-mobile devices where screen real estate is plenty
if(! /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
    React.render(<ScrollToTopBtn />, document.getElementById('up-component'));
}

// Hijack href clicks so that the browser won't reload
$(document).on('click', 'a', function (e) {

    // don't hijack external links or mod-key clicks
    if (this.className === 'external'
        || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
        return true;
    }

    // remove the "http://domain.com" part:
    var route = this.href.replace(/^.*\/\/[^\/]+/, '');

    router.setRoute(route);
    e.preventDefault();
});
