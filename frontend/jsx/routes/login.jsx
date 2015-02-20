/** @jsx React.DOM */
var RouteMixin = require('../mixins/route.jsx');
var auth = require('../mixins/auth.jsx');
var HideWhenLoggedInMixin = auth.HideWhenLoggedInMixin;
var TextInput = require('../shared_components/text_input.jsx');
var CheckboxInput = require('../shared_components/checkbox_input.jsx');
var lang = require('../languages/index.js');
var shortcut = require('../keyboard_shortcuts.jsx');

module.exports = React.createClass({
    mixins: [RouteMixin, HideWhenLoggedInMixin],
    pageTitle: 'Login',

    getInitialState: function() {
        return {
            msg: '',
            msgType: 'info',
            submitting: false
        };
    },

    handleSubmit: function(e) {
        e.preventDefault();

        var email = this.refs.email.state.value;
        var password = this.refs.password.state.value;
        var remember = this.refs.remember.state.value;

        if (!email || !password) {
            return;
        }

        this.setState({
            msg: '',
            submitting: true
        });
        var data = JSON.stringify({
            email: email,
            password: password,
            remember: remember ? '1' : '0',
        });
        var self = this;
        $.ajax({
            url: '/api/login',
            dataType: 'json',
            method: 'POST',
            data: data,
            success: function(data) {
                self.setState({
                    msgType: 'success',
                    msg: 'Successfully logged in.'
                });
                shortcut.set(data.settings.enable_shortcut);
                lang.set(data.settings.language);
                self.props.setLoggedIn(email, data.token, remember);
            },
            error: function(data) {
                self.setState({
                    msgType: 'danger',
                    msg: data.responseJSON.msg
                });
            },
            complete: function() {
                self.setState({
                    submitting: false
                });
            }
        });

        return;
    },

    render: function() {
        var msgBlock ='';
        if (this.state.msg) {
            msgClass = 'alert alert-' + this.state.msgType;
            msgBlock =
                <p className={msgClass} role='alert'>{this.state.msg}</p>
            ;
        }

        var submitBtn = this.renderSubmitBtn(this.state.submitting);
        return (
            <form onSubmit={this.handleSubmit}
                className="form-horizontal center-form" role="form">
                <TextInput ref="email" label="Email" type="email" />
                <TextInput ref="password" label={echo('password')} type="password" />
                <CheckboxInput ref="remember" label={echo('remember_me')} />

                <div className="form-group">
                    <div className="col-sm-offset-2 col-sm-10">
                        {submitBtn}
                    </div>
                </div>

                <div className="form-group">
                    <div className="col-sm-offset-2 col-sm-10">
                        <div className="checkbox">
                            <a href="/reset-password">{echo('forgot_password?')}</a>
                        </div>
                    </div>
                </div>

                <div className="form-group">
                    <div className="col-sm-offset-2 col-sm-10">
                        {msgBlock}
                    </div>
                </div>
            </form>
        );
    },

    renderSubmitBtn: function(submitting) {
        if (!submitting) {
            return (
                <button type="submit" className="btn btn-primary">
                    {echo('login')}
                </button>
            );
        } else {
            return (
                <button type="submit" className="btn btn-primary" disabled="disabled">
                    <i className="fa fa-spin fa-spinner"></i> Logging in...
                </button>
            );
        }
    }

});
