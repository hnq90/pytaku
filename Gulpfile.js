/**
 * The only tasks you'll ever need to call are:
 *
 * $ gulp init
 *   => Pull libraries with bower then compile everything.
 *      Run this once after `npm install`.
 *
 * $ gulp
 *   => Recompile everything.
 *      This assumes bower components have already been downloaded.
 *
 * $ gulp watch
 *   => Watch for changes in application code and trigger livereload.
 *
 * $ gulp deploy
 *   => Similar to default `gulp` task, but also minify JS + CSS.
 */

var gulp = require('gulp');
var livereload = require('gulp-livereload');
var concat = require('gulp-concat');
var htmlmin = require('gulp-htmlmin');
var minifycss = require('gulp-minify-css');
var notify = require('gulp-notify');
var bower = require('bower');
var gulpif = require('gulp-if');
var uglify = require('gulp-uglify');
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var streamify = require('gulp-streamify');
var through = require('through2');
var yaml = require('js-yaml');

var gutil = require('gulp-util');
var PluginError = gutil.PluginError;


var target = 'DEV';
var PRODUCTION = 'PROD';

// Concat js libraries
gulp.task('jslib', function() {
    var files;
    if (target === PRODUCTION) {
        files = [
            'bower_components/jquery/dist/jquery.min.js',
            'bower_components/mousetrap/mousetrap.min.js',
            'bower_components/bootstrap/dist/js/bootstrap.min.js',
            'bower_components/react/react.min.js',
            'bower_components/director/build/director.min.js',
        ];
    } else {
        files = [
            'bower_components/jquery/dist/jquery.js',
            'bower_components/mousetrap/mousetrap.js',
            'bower_components/bootstrap/dist/js/bootstrap.js',
            'bower_components/react/react.js',
            'bower_components/director/build/director.js',
        ];
    }

    gulp.src(files)
    .pipe(gulpif(target === PRODUCTION, uglify()))
    .pipe(concat('lib.js'))
    .pipe(gulp.dest('frontend-dist/static/js'));
});

// Concat css libraries
gulp.task('csslib', function() {
    var files;
    if (target === PRODUCTION) {
        files = [
            'bower_components/normalize-css/normalize.css',
            'frontend/css/vendor/bootstrap-darkly.css',
            'bower_components/fontawesome/css/font-awesome.min.css',
        ];
    } else {
        files = [
            'bower_components/normalize-css/normalize.css',
            'frontend/css/vendor/bootstrap-darkly.css',
            'bower_components/fontawesome/css/font-awesome.css',
        ];
    }

    gulp.src(files)
    .pipe(gulpif(target === PRODUCTION, minifycss({processImport: false})))
    .pipe(concat('lib.css'))
    .pipe(gulp.dest('frontend-dist/static/css'));

    // Extra files required by fontawesome
    gulp.src('bower_components/fontawesome/fonts/*')
    .pipe(gulp.dest('frontend-dist/static/fonts'));
});

// Download & concat all libraries
gulp.task('lib', function() {
    bower.commands.install([], {save: true}, {})
    .on('end', function(){
        gulp.start('csslib', 'jslib');
    });
});

// Convert yaml languages files into a single js that can be included as a
// commonjs module
gulp.task('lang', function() {

    // Creating a stream through which each file will pass.
    // This will turn yaml files to commonjs-compliant js files.
    var stream = through.obj(function(file, enc, cb) {
        if (file.isStream()) {
            this.emit('error', new PluginError('YamlToJS', 'Streams not supported!'));
            return cb();
        }

        // turn yaml code into commonJS code
        if (file.isBuffer()) {
            var jsStr = yaml.load(file.contents.toString());
            file.contents = new Buffer("module.exports = " + JSON.stringify(jsStr) + ";");

            // change extension to js too
            file.path = file.path.toString().replace(/\.yaml$/, '.js');
        }

        this.push(file); // make sure file goes through the gulp plugin
        cb(); // tell the stream engine that we are done with this file
    });


    gulp.src('./frontend/languages/*.yaml')
    .pipe(stream)
    .pipe(gulp.dest('./frontend/languages'));
});

// Compile application jsx
gulp.task('jsx', ['lang'], function() {
    browserify([
        './frontend/jsx/app.jsx'
    ]).bundle()
    .on('error', function(err) {
        console.log(err.message);
        this.end();
    })
    .pipe(source('main.js'))
    .on('error', notify.onError({message: 'JSX compilation failed!'}))
    .pipe(gulpif(target === PRODUCTION, streamify(uglify())))
    .pipe(gulp.dest('frontend-dist/static/js'));
});

// Application css
gulp.task('css', function() {
    gulp.src('frontend/css/style.css')
    .pipe(gulpif(target === PRODUCTION, minifycss()))
    .pipe(concat('main.css'))
    .pipe(gulp.dest('frontend-dist/static/css'));
});

// Main html file. Nothing exciting here
gulp.task('html', function() {
    gulp.src('frontend/app.html')
    .pipe(gulpif(target === PRODUCTION, htmlmin({collapseWhitespace: true})))
    .pipe(gulp.dest('frontend-dist'));
});

// Because every kick-ass site has a kick-ass favicon
gulp.task('favicon', function() {
    gulp.src('frontend/favicon.ico')
    .pipe(gulp.dest('frontend-dist'));
});

// Run this once to fetch bower components and build for the first time
gulp.task('init', [], function() {
    bower.commands.install([], {save: true}, {})
    .on('end', function(){
        gulp.start('default');
    });
});

// Build everything for development
gulp.task('default', [], function() {
    gulp.start('jslib', 'csslib', 'jsx', 'css', 'html', 'favicon');
});

// Download & build & minify everything for deployment
gulp.task('deploy', function() {
    target = PRODUCTION;
    gulp.start('default');
});

// Watch for changes in application code and trigger livereload
gulp.task('watch', function() {

    // If there's a change in source code then build dist
    gulp.watch('frontend/css/**/*.css', ['css']);
    gulp.watch('frontend/jsx/**/*.jsx', ['jsx']);
    gulp.watch('frontend/jsx/**/*.js', ['jsx']);
    gulp.watch('frontend/languages/*.yaml', ['jsx']);
    gulp.watch('frontend/app.html', ['html']);
    gulp.watch('frontend/favicon.ico', ['favicon']);

    livereload.listen();

    // If there's a change in dist then trigger livereload
    gulp.watch(['frontend-dist/**/*', 'frontend']).on('change', function(file) {
        livereload.changed(file);
    });
});
