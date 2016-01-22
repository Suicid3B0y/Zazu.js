/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */
/* jshint browser: true, camelcase: true, curly: true, devel: true,
 eqeqeq: true, forin: false, globalstrict: true, node: true,
 quotmark: single, undef: true, unused: strict */
/* global mozRTCIceCandidate, mozRTCPeerConnection, Promise,
 mozRTCSessionDescription, webkitRTCPeerConnection, MediaStreamTrack */
/* exported trace,requestUserMedia */

'use strict';

var getUserMedia = null;
var attachMediaStream = null;
var reattachMediaStream = null;
var webrtcDetectedBrowser = null;
var webrtcDetectedVersion = null;
var webrtcMinimumVersion = null;
var webrtcUtils = {
    log: function () {
        // suppress console.log output when being included as a module.
        if (typeof module !== 'undefined' ||
            typeof require === 'function' && typeof define === 'function') {
            return;
        }
        console.log.apply(console, arguments);
    },
    extractVersion: function (uastring, expr, pos) {
        var match = uastring.match(expr);
        return match && match.length >= pos && parseInt(match[pos]);
    }
};

function trace(text) {
    // This function is used for logging.
    if (text[text.length - 1] === '\n') {
        text = text.substring(0, text.length - 1);
    }
    if (window.performance) {
        var now = (window.performance.now() / 1000).toFixed(3);
        webrtcUtils.log(now + ': ' + text);
    } else {
        webrtcUtils.log(text);
    }
}

if (typeof window === 'object') {
    if (window.HTMLMediaElement && !('srcObject' in window.HTMLMediaElement.prototype)) {
        // Shim the srcObject property, once, when HTMLMediaElement is found.
        Object.defineProperty(window.HTMLMediaElement.prototype, 'srcObject', {
            get: function () {
                // If prefixed srcObject property exists, return it.
                // Otherwise use the shimmed property, _srcObject
                return 'mozSrcObject' in this ? this.mozSrcObject : this._srcObject;
            },
            set: function (stream) {
                if ('mozSrcObject' in this) {
                    this.mozSrcObject = stream;
                } else {
                    // Use _srcObject as a private property for this shim
                    this._srcObject = stream;
                    // TODO: revokeObjectUrl(this.src) when !stream to release resources?
                    this.src = URL.createObjectURL(stream);
                }
            }
        });
    }
    // Proxy existing globals
    getUserMedia = window.navigator && window.navigator.getUserMedia;
}

// Attach a media stream to an element.
attachMediaStream = function (element, stream) {
    element.srcObject = stream;
};

reattachMediaStream = function (to, from) {
    to.srcObject = from.srcObject;
};

if (typeof window === 'undefined' || !window.navigator) {
    webrtcUtils.log('This does not appear to be a browser');
    webrtcDetectedBrowser = 'not a browser';
} else if (navigator.mozGetUserMedia && window.mozRTCPeerConnection) {
    webrtcUtils.log('This appears to be Firefox');

    webrtcDetectedBrowser = 'firefox';

    // the detected firefox version.
    webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent,
        /Firefox\/([0-9]+)\./, 1);

    // the minimum firefox version still supported by adapter.
    webrtcMinimumVersion = 31;

    // The RTCPeerConnection object.
    window.RTCPeerConnection = function (pcConfig, pcConstraints) {
        if (webrtcDetectedVersion < 38) {
            // .urls is not supported in FF < 38.
            // create RTCIceServers with a single url.
            if (pcConfig && pcConfig.iceServers) {
                var newIceServers = [];
                for (var i = 0; i < pcConfig.iceServers.length; i++) {
                    var server = pcConfig.iceServers[i];
                    if (server.hasOwnProperty('urls')) {
                        for (var j = 0; j < server.urls.length; j++) {
                            var newServer = {
                                url: server.urls[j]
                            };
                            if (server.urls[j].indexOf('turn') === 0) {
                                newServer.username = server.username;
                                newServer.credential = server.credential;
                            }
                            newIceServers.push(newServer);
                        }
                    } else {
                        newIceServers.push(pcConfig.iceServers[i]);
                    }
                }
                pcConfig.iceServers = newIceServers;
            }
        }
        return new mozRTCPeerConnection(pcConfig, pcConstraints); // jscs:ignore requireCapitalizedConstructors
    };

    // The RTCSessionDescription object.
    if (!window.RTCSessionDescription) {
        window.RTCSessionDescription = mozRTCSessionDescription;
    }

    // The RTCIceCandidate object.
    if (!window.RTCIceCandidate) {
        window.RTCIceCandidate = mozRTCIceCandidate;
    }

    // getUserMedia constraints shim.
    getUserMedia = function (constraints, onSuccess, onError) {
        var constraintsToFF37 = function (c) {
            if (typeof c !== 'object' || c.require) {
                return c;
            }
            var require = [];
            Object.keys(c).forEach(function (key) {
                if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
                    return;
                }
                var r = c[key] = (typeof c[key] === 'object') ?
                    c[key] : {ideal: c[key]};
                if (r.min !== undefined ||
                    r.max !== undefined || r.exact !== undefined) {
                    require.push(key);
                }
                if (r.exact !== undefined) {
                    if (typeof r.exact === 'number') {
                        r.min = r.max = r.exact;
                    } else {
                        c[key] = r.exact;
                    }
                    delete r.exact;
                }
                if (r.ideal !== undefined) {
                    c.advanced = c.advanced || [];
                    var oc = {};
                    if (typeof r.ideal === 'number') {
                        oc[key] = {min: r.ideal, max: r.ideal};
                    } else {
                        oc[key] = r.ideal;
                    }
                    c.advanced.push(oc);
                    delete r.ideal;
                    if (!Object.keys(r).length) {
                        delete c[key];
                    }
                }
            });
            if (require.length) {
                c.require = require;
            }
            return c;
        };
        if (webrtcDetectedVersion < 38) {
            webrtcUtils.log('spec: ' + JSON.stringify(constraints));
            if (constraints.audio) {
                constraints.audio = constraintsToFF37(constraints.audio);
            }
            if (constraints.video) {
                constraints.video = constraintsToFF37(constraints.video);
            }
            webrtcUtils.log('ff37: ' + JSON.stringify(constraints));
        }
        return navigator.mozGetUserMedia(constraints, onSuccess, onError);
    };

    navigator.getUserMedia = getUserMedia;

    // Shim for mediaDevices on older versions.
    if (!navigator.mediaDevices) {
        navigator.mediaDevices = {
            getUserMedia: requestUserMedia,
            addEventListener: function () {
            },
            removeEventListener: function () {
            }
        };
    }
    navigator.mediaDevices.enumerateDevices =
        navigator.mediaDevices.enumerateDevices || function () {
            return new Promise(function (resolve) {
                var infos = [
                    {kind: 'audioinput', deviceId: 'default', label: '', groupId: ''},
                    {kind: 'videoinput', deviceId: 'default', label: '', groupId: ''}
                ];
                resolve(infos);
            });
        };

    if (webrtcDetectedVersion < 41) {
        // Work around http://bugzil.la/1169665
        var orgEnumerateDevices =
            navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
        navigator.mediaDevices.enumerateDevices = function () {
            return orgEnumerateDevices().then(undefined, function (e) {
                if (e.name === 'NotFoundError') {
                    return [];
                }
                throw e;
            });
        };
    }
} else if (navigator.webkitGetUserMedia && window.webkitRTCPeerConnection) {
    webrtcUtils.log('This appears to be Chrome');

    webrtcDetectedBrowser = 'chrome';

    // the detected chrome version.
    webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent,
        /Chrom(e|ium)\/([0-9]+)\./, 2);

    // the minimum chrome version still supported by adapter.
    webrtcMinimumVersion = 38;

    // The RTCPeerConnection object.
    window.RTCPeerConnection = function (pcConfig, pcConstraints) {
        // Translate iceTransportPolicy to iceTransports,
        // see https://code.google.com/p/webrtc/issues/detail?id=4869
        if (pcConfig && pcConfig.iceTransportPolicy) {
            pcConfig.iceTransports = pcConfig.iceTransportPolicy;
        }

        var pc = new webkitRTCPeerConnection(pcConfig, pcConstraints); // jscs:ignore requireCapitalizedConstructors
        var origGetStats = pc.getStats.bind(pc);
        pc.getStats = function (selector, successCallback, errorCallback) { // jshint ignore: line
            var self = this;
            var args = arguments;

            // If selector is a function then we are in the old style stats so just
            // pass back the original getStats format to avoid breaking old users.
            if (arguments.length > 0 && typeof selector === 'function') {
                return origGetStats(selector, successCallback);
            }

            var fixChromeStats = function (response) {
                var standardReport = {};
                var reports = response.result();
                reports.forEach(function (report) {
                    var standardStats = {
                        id: report.id,
                        timestamp: report.timestamp,
                        type: report.type
                    };
                    report.names().forEach(function (name) {
                        standardStats[name] = report.stat(name);
                    });
                    standardReport[standardStats.id] = standardStats;
                });

                return standardReport;
            };

            if (arguments.length >= 2) {
                var successCallbackWrapper = function (response) {
                    args[1](fixChromeStats(response));
                };

                return origGetStats.apply(this, [successCallbackWrapper, arguments[0]]);
            }

            // promise-support
            return new Promise(function (resolve, reject) {
                if (args.length === 1 && selector === null) {
                    origGetStats.apply(self, [
                        function (response) {
                            resolve.apply(null, [fixChromeStats(response)]);
                        }, reject]);
                } else {
                    origGetStats.apply(self, [resolve, reject]);
                }
            });
        };

        return pc;
    };

    // add promise support
    ['createOffer', 'createAnswer'].forEach(function (method) {
        var nativeMethod = webkitRTCPeerConnection.prototype[method];
        webkitRTCPeerConnection.prototype[method] = function () {
            var self = this;
            if (arguments.length < 1 || (arguments.length === 1 &&
                typeof(arguments[0]) === 'object')) {
                var opts = arguments.length === 1 ? arguments[0] : undefined;
                return new Promise(function (resolve, reject) {
                    nativeMethod.apply(self, [resolve, reject, opts]);
                });
            } else {
                return nativeMethod.apply(this, arguments);
            }
        };
    });

    ['setLocalDescription', 'setRemoteDescription',
        'addIceCandidate'].forEach(function (method) {
        var nativeMethod = webkitRTCPeerConnection.prototype[method];
        webkitRTCPeerConnection.prototype[method] = function () {
            var args = arguments;
            var self = this;
            return new Promise(function (resolve, reject) {
                nativeMethod.apply(self, [args[0],
                    function () {
                        resolve();
                        if (args.length >= 2) {
                            args[1].apply(null, []);
                        }
                    },
                    function (err) {
                        reject(err);
                        if (args.length >= 3) {
                            args[2].apply(null, [err]);
                        }
                    }]
                );
            });
        };
    });

    // getUserMedia constraints shim.
    var constraintsToChrome = function (c) {
        if (typeof c !== 'object' || c.mandatory || c.optional) {
            return c;
        }
        var cc = {};
        Object.keys(c).forEach(function (key) {
            if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
                return;
            }
            var r = (typeof c[key] === 'object') ? c[key] : {ideal: c[key]};
            if (r.exact !== undefined && typeof r.exact === 'number') {
                r.min = r.max = r.exact;
            }
            var oldname = function (prefix, name) {
                if (prefix) {
                    return prefix + name.charAt(0).toUpperCase() + name.slice(1);
                }
                return (name === 'deviceId') ? 'sourceId' : name;
            };
            if (r.ideal !== undefined) {
                cc.optional = cc.optional || [];
                var oc = {};
                if (typeof r.ideal === 'number') {
                    oc[oldname('min', key)] = r.ideal;
                    cc.optional.push(oc);
                    oc = {};
                    oc[oldname('max', key)] = r.ideal;
                    cc.optional.push(oc);
                } else {
                    oc[oldname('', key)] = r.ideal;
                    cc.optional.push(oc);
                }
            }
            if (r.exact !== undefined && typeof r.exact !== 'number') {
                cc.mandatory = cc.mandatory || {};
                cc.mandatory[oldname('', key)] = r.exact;
            } else {
                ['min', 'max'].forEach(function (mix) {
                    if (r[mix] !== undefined) {
                        cc.mandatory = cc.mandatory || {};
                        cc.mandatory[oldname(mix, key)] = r[mix];
                    }
                });
            }
        });
        if (c.advanced) {
            cc.optional = (cc.optional || []).concat(c.advanced);
        }
        return cc;
    };

    getUserMedia = function (constraints, onSuccess, onError) {
        if (constraints.audio) {
            constraints.audio = constraintsToChrome(constraints.audio);
        }
        if (constraints.video) {
            constraints.video = constraintsToChrome(constraints.video);
        }
        webrtcUtils.log('chrome: ' + JSON.stringify(constraints));
        return navigator.webkitGetUserMedia(constraints, onSuccess, onError);
    };
    navigator.getUserMedia = getUserMedia;

    if (!navigator.mediaDevices) {
        navigator.mediaDevices = {
            getUserMedia: requestUserMedia,
            enumerateDevices: function () {
                return new Promise(function (resolve) {
                    var kinds = {audio: 'audioinput', video: 'videoinput'};
                    return MediaStreamTrack.getSources(function (devices) {
                        resolve(devices.map(function (device) {
                            return {
                                label: device.label,
                                kind: kinds[device.kind],
                                deviceId: device.id,
                                groupId: ''
                            };
                        }));
                    });
                });
            }
        };
    }

    // A shim for getUserMedia method on the mediaDevices object.
    // TODO(KaptenJansson) remove once implemented in Chrome stable.
    if (!navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia = function (constraints) {
            return requestUserMedia(constraints);
        };
    } else {
        // Even though Chrome 45 has navigator.mediaDevices and a getUserMedia
        // function which returns a Promise, it does not accept spec-style
        // constraints.
        var origGetUserMedia = navigator.mediaDevices.getUserMedia.
        bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function (c) {
            webrtcUtils.log('spec:   ' + JSON.stringify(c)); // whitespace for alignment
            c.audio = constraintsToChrome(c.audio);
            c.video = constraintsToChrome(c.video);
            webrtcUtils.log('chrome: ' + JSON.stringify(c));
            return origGetUserMedia(c);
        };
    }

    // Dummy devicechange event methods.
    // TODO(KaptenJansson) remove once implemented in Chrome stable.
    if (typeof navigator.mediaDevices.addEventListener === 'undefined') {
        navigator.mediaDevices.addEventListener = function () {
            webrtcUtils.log('Dummy mediaDevices.addEventListener called.');
        };
    }
    if (typeof navigator.mediaDevices.removeEventListener === 'undefined') {
        navigator.mediaDevices.removeEventListener = function () {
            webrtcUtils.log('Dummy mediaDevices.removeEventListener called.');
        };
    }

    // Attach a media stream to an element.
    attachMediaStream = function (element, stream) {
        if (webrtcDetectedVersion >= 43) {
            element.srcObject = stream;
        } else if (typeof element.src !== 'undefined') {
            element.src = URL.createObjectURL(stream);
        } else {
            webrtcUtils.log('Error attaching stream to element.');
        }
    };
    reattachMediaStream = function (to, from) {
        if (webrtcDetectedVersion >= 43) {
            to.srcObject = from.srcObject;
        } else {
            to.src = from.src;
        }
    };

} else if (navigator.mediaDevices && navigator.userAgent.match(
        /Edge\/(\d+).(\d+)$/)) {
    webrtcUtils.log('This appears to be Edge');
    webrtcDetectedBrowser = 'edge';

    webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent,
        /Edge\/(\d+).(\d+)$/, 2);

    // the minimum version still supported by adapter.
    webrtcMinimumVersion = 12;
} else {
    webrtcUtils.log('Browser does not appear to be WebRTC-capable');
}

// Returns the result of getUserMedia as a Promise.
function requestUserMedia(constraints) {
    return new Promise(function (resolve, reject) {
        getUserMedia(constraints, resolve, reject);
    });
}

var webrtcTesting = {};
try {
    Object.defineProperty(webrtcTesting, 'version', {
        set: function (version) {
            webrtcDetectedVersion = version;
        }
    });
} catch (e) {
}

if (typeof module !== 'undefined') {
    var RTCPeerConnection;
    if (typeof window !== 'undefined') {
        RTCPeerConnection = window.RTCPeerConnection;
    }
    module.exports = {
        RTCPeerConnection: RTCPeerConnection,
        getUserMedia: getUserMedia,
        attachMediaStream: attachMediaStream,
        reattachMediaStream: reattachMediaStream,
        webrtcDetectedBrowser: webrtcDetectedBrowser,
        webrtcDetectedVersion: webrtcDetectedVersion,
        webrtcMinimumVersion: webrtcMinimumVersion,
        webrtcTesting: webrtcTesting,
        webrtcUtils: webrtcUtils
        //requestUserMedia: not exposed on purpose.
        //trace: not exposed on purpose.
    };
} else if ((typeof require === 'function') && (typeof define === 'function')) {
    // Expose objects and functions when RequireJS is doing the loading.
    define([], function () {
        return {
            RTCPeerConnection: window.RTCPeerConnection,
            getUserMedia: getUserMedia,
            attachMediaStream: attachMediaStream,
            reattachMediaStream: reattachMediaStream,
            webrtcDetectedBrowser: webrtcDetectedBrowser,
            webrtcDetectedVersion: webrtcDetectedVersion,
            webrtcMinimumVersion: webrtcMinimumVersion,
            webrtcTesting: webrtcTesting,
            webrtcUtils: webrtcUtils
            //requestUserMedia: not exposed on purpose.
            //trace: not exposed on purpose.
        };
    });
}

/**
 * bootbox.js v4.4.0
 *
 * http://bootboxjs.com/license.txt
 */
!function(a,b){"use strict";"function"==typeof define&&define.amd?define(["jquery"],b):"object"==typeof exports?module.exports=b(require("jquery")):a.bootbox=b(a.jQuery)}(this,function a(b,c){"use strict";function d(a){var b=q[o.locale];return b?b[a]:q.en[a]}function e(a,c,d){a.stopPropagation(),a.preventDefault();var e=b.isFunction(d)&&d.call(c,a)===!1;e||c.modal("hide")}function f(a){var b,c=0;for(b in a)c++;return c}function g(a,c){var d=0;b.each(a,function(a,b){c(a,b,d++)})}function h(a){var c,d;if("object"!=typeof a)throw new Error("Please supply an object of options");if(!a.message)throw new Error("Please specify a message");return a=b.extend({},o,a),a.buttons||(a.buttons={}),c=a.buttons,d=f(c),g(c,function(a,e,f){if(b.isFunction(e)&&(e=c[a]={callback:e}),"object"!==b.type(e))throw new Error("button with key "+a+" must be an object");e.label||(e.label=a),e.className||(e.className=2>=d&&f===d-1?"btn-primary":"btn-default")}),a}function i(a,b){var c=a.length,d={};if(1>c||c>2)throw new Error("Invalid argument length");return 2===c||"string"==typeof a[0]?(d[b[0]]=a[0],d[b[1]]=a[1]):d=a[0],d}function j(a,c,d){return b.extend(!0,{},a,i(c,d))}function k(a,b,c,d){var e={className:"bootbox-"+a,buttons:l.apply(null,b)};return m(j(e,d,c),b)}function l(){for(var a={},b=0,c=arguments.length;c>b;b++){var e=arguments[b],f=e.toLowerCase(),g=e.toUpperCase();a[f]={label:d(g)}}return a}function m(a,b){var d={};return g(b,function(a,b){d[b]=!0}),g(a.buttons,function(a){if(d[a]===c)throw new Error("button key "+a+" is not allowed (options are "+b.join("\n")+")")}),a}var n={dialog:"<div class='bootbox modal' tabindex='-1' role='dialog'><div class='modal-dialog'><div class='modal-content'><div class='modal-body'><div class='bootbox-body'></div></div></div></div></div>",header:"<div class='modal-header'><h4 class='modal-title'></h4></div>",footer:"<div class='modal-footer'></div>",closeButton:"<button type='button' class='bootbox-close-button close' data-dismiss='modal' aria-hidden='true'>&times;</button>",form:"<form class='bootbox-form'></form>",inputs:{text:"<input class='bootbox-input bootbox-input-text form-control' autocomplete=off type=text />",textarea:"<textarea class='bootbox-input bootbox-input-textarea form-control'></textarea>",email:"<input class='bootbox-input bootbox-input-email form-control' autocomplete='off' type='email' />",select:"<select class='bootbox-input bootbox-input-select form-control'></select>",checkbox:"<div class='checkbox'><label><input class='bootbox-input bootbox-input-checkbox' type='checkbox' /></label></div>",date:"<input class='bootbox-input bootbox-input-date form-control' autocomplete=off type='date' />",time:"<input class='bootbox-input bootbox-input-time form-control' autocomplete=off type='time' />",number:"<input class='bootbox-input bootbox-input-number form-control' autocomplete=off type='number' />",password:"<input class='bootbox-input bootbox-input-password form-control' autocomplete='off' type='password' />"}},o={locale:"en",backdrop:"static",animate:!0,className:null,closeButton:!0,show:!0,container:"body"},p={};p.alert=function(){var a;if(a=k("alert",["ok"],["message","callback"],arguments),a.callback&&!b.isFunction(a.callback))throw new Error("alert requires callback property to be a function when provided");return a.buttons.ok.callback=a.onEscape=function(){return b.isFunction(a.callback)?a.callback.call(this):!0},p.dialog(a)},p.confirm=function(){var a;if(a=k("confirm",["cancel","confirm"],["message","callback"],arguments),a.buttons.cancel.callback=a.onEscape=function(){return a.callback.call(this,!1)},a.buttons.confirm.callback=function(){return a.callback.call(this,!0)},!b.isFunction(a.callback))throw new Error("confirm requires a callback");return p.dialog(a)},p.prompt=function(){var a,d,e,f,h,i,k;if(f=b(n.form),d={className:"bootbox-prompt",buttons:l("cancel","confirm"),value:"",inputType:"text"},a=m(j(d,arguments,["title","callback"]),["cancel","confirm"]),i=a.show===c?!0:a.show,a.message=f,a.buttons.cancel.callback=a.onEscape=function(){return a.callback.call(this,null)},a.buttons.confirm.callback=function(){var c;switch(a.inputType){case"text":case"textarea":case"email":case"select":case"date":case"time":case"number":case"password":c=h.val();break;case"checkbox":var d=h.find("input:checked");c=[],g(d,function(a,d){c.push(b(d).val())})}return a.callback.call(this,c)},a.show=!1,!a.title)throw new Error("prompt requires a title");if(!b.isFunction(a.callback))throw new Error("prompt requires a callback");if(!n.inputs[a.inputType])throw new Error("invalid prompt type");switch(h=b(n.inputs[a.inputType]),a.inputType){case"text":case"textarea":case"email":case"date":case"time":case"number":case"password":h.val(a.value);break;case"select":var o={};if(k=a.inputOptions||[],!b.isArray(k))throw new Error("Please pass an array of input options");if(!k.length)throw new Error("prompt with select requires options");g(k,function(a,d){var e=h;if(d.value===c||d.text===c)throw new Error("given options in wrong format");d.group&&(o[d.group]||(o[d.group]=b("<optgroup/>").attr("label",d.group)),e=o[d.group]),e.append("<option value='"+d.value+"'>"+d.text+"</option>")}),g(o,function(a,b){h.append(b)}),h.val(a.value);break;case"checkbox":var q=b.isArray(a.value)?a.value:[a.value];if(k=a.inputOptions||[],!k.length)throw new Error("prompt with checkbox requires options");if(!k[0].value||!k[0].text)throw new Error("given options in wrong format");h=b("<div/>"),g(k,function(c,d){var e=b(n.inputs[a.inputType]);e.find("input").attr("value",d.value),e.find("label").append(d.text),g(q,function(a,b){b===d.value&&e.find("input").prop("checked",!0)}),h.append(e)})}return a.placeholder&&h.attr("placeholder",a.placeholder),a.pattern&&h.attr("pattern",a.pattern),a.maxlength&&h.attr("maxlength",a.maxlength),f.append(h),f.on("submit",function(a){a.preventDefault(),a.stopPropagation(),e.find(".btn-primary").click()}),e=p.dialog(a),e.off("shown.bs.modal"),e.on("shown.bs.modal",function(){h.focus()}),i===!0&&e.modal("show"),e},p.dialog=function(a){a=h(a);var d=b(n.dialog),f=d.find(".modal-dialog"),i=d.find(".modal-body"),j=a.buttons,k="",l={onEscape:a.onEscape};if(b.fn.modal===c)throw new Error("$.fn.modal is not defined; please double check you have included the Bootstrap JavaScript library. See http://getbootstrap.com/javascript/ for more details.");if(g(j,function(a,b){k+="<button data-bb-handler='"+a+"' type='button' class='btn "+b.className+"'>"+b.label+"</button>",l[a]=b.callback}),i.find(".bootbox-body").html(a.message),a.animate===!0&&d.addClass("fade"),a.className&&d.addClass(a.className),"large"===a.size?f.addClass("modal-lg"):"small"===a.size&&f.addClass("modal-sm"),a.title&&i.before(n.header),a.closeButton){var m=b(n.closeButton);a.title?d.find(".modal-header").prepend(m):m.css("margin-top","-10px").prependTo(i)}return a.title&&d.find(".modal-title").html(a.title),k.length&&(i.after(n.footer),d.find(".modal-footer").html(k)),d.on("hidden.bs.modal",function(a){a.target===this&&d.remove()}),d.on("shown.bs.modal",function(){d.find(".btn-primary:first").focus()}),"static"!==a.backdrop&&d.on("click.dismiss.bs.modal",function(a){d.children(".modal-backdrop").length&&(a.currentTarget=d.children(".modal-backdrop").get(0)),a.target===a.currentTarget&&d.trigger("escape.close.bb")}),d.on("escape.close.bb",function(a){l.onEscape&&e(a,d,l.onEscape)}),d.on("click",".modal-footer button",function(a){var c=b(this).data("bb-handler");e(a,d,l[c])}),d.on("click",".bootbox-close-button",function(a){e(a,d,l.onEscape)}),d.on("keyup",function(a){27===a.which&&d.trigger("escape.close.bb")}),b(a.container).append(d),d.modal({backdrop:a.backdrop?"static":!1,keyboard:!1,show:!1}),a.show&&d.modal("show"),d},p.setDefaults=function(){var a={};2===arguments.length?a[arguments[0]]=arguments[1]:a=arguments[0],b.extend(o,a)},p.hideAll=function(){return b(".bootbox").modal("hide"),p};var q={bg_BG:{OK:"Ок",CANCEL:"Отказ",CONFIRM:"Потвърждавам"},br:{OK:"OK",CANCEL:"Cancelar",CONFIRM:"Sim"},cs:{OK:"OK",CANCEL:"Zrušit",CONFIRM:"Potvrdit"},da:{OK:"OK",CANCEL:"Annuller",CONFIRM:"Accepter"},de:{OK:"OK",CANCEL:"Abbrechen",CONFIRM:"Akzeptieren"},el:{OK:"Εντάξει",CANCEL:"Ακύρωση",CONFIRM:"Επιβεβαίωση"},en:{OK:"OK",CANCEL:"Cancel",CONFIRM:"OK"},es:{OK:"OK",CANCEL:"Cancelar",CONFIRM:"Aceptar"},et:{OK:"OK",CANCEL:"Katkesta",CONFIRM:"OK"},fa:{OK:"قبول",CANCEL:"لغو",CONFIRM:"تایید"},fi:{OK:"OK",CANCEL:"Peruuta",CONFIRM:"OK"},fr:{OK:"OK",CANCEL:"Annuler",CONFIRM:"D'accord"},he:{OK:"אישור",CANCEL:"ביטול",CONFIRM:"אישור"},hu:{OK:"OK",CANCEL:"Mégsem",CONFIRM:"Megerősít"},hr:{OK:"OK",CANCEL:"Odustani",CONFIRM:"Potvrdi"},id:{OK:"OK",CANCEL:"Batal",CONFIRM:"OK"},it:{OK:"OK",CANCEL:"Annulla",CONFIRM:"Conferma"},ja:{OK:"OK",CANCEL:"キャンセル",CONFIRM:"確認"},lt:{OK:"Gerai",CANCEL:"Atšaukti",CONFIRM:"Patvirtinti"},lv:{OK:"Labi",CANCEL:"Atcelt",CONFIRM:"Apstiprināt"},nl:{OK:"OK",CANCEL:"Annuleren",CONFIRM:"Accepteren"},no:{OK:"OK",CANCEL:"Avbryt",CONFIRM:"OK"},pl:{OK:"OK",CANCEL:"Anuluj",CONFIRM:"Potwierdź"},pt:{OK:"OK",CANCEL:"Cancelar",CONFIRM:"Confirmar"},ru:{OK:"OK",CANCEL:"Отмена",CONFIRM:"Применить"},sq:{OK:"OK",CANCEL:"Anulo",CONFIRM:"Prano"},sv:{OK:"OK",CANCEL:"Avbryt",CONFIRM:"OK"},th:{OK:"ตกลง",CANCEL:"ยกเลิก",CONFIRM:"ยืนยัน"},tr:{OK:"Tamam",CANCEL:"İptal",CONFIRM:"Onayla"},zh_CN:{OK:"OK",CANCEL:"取消",CONFIRM:"确认"},zh_TW:{OK:"OK",CANCEL:"取消",CONFIRM:"確認"}};return p.addLocale=function(a,c){return b.each(["OK","CANCEL","CONFIRM"],function(a,b){if(!c[b])throw new Error("Please supply a translation for '"+b+"'")}),q[a]={OK:c.OK,CANCEL:c.CANCEL,CONFIRM:c.CONFIRM},p},p.removeLocale=function(a){return delete q[a],p},p.setLocale=function(a){return p.setDefaults("locale",a)},p.init=function(c){return a(c||b)},p});
/*!
 * Bootstrap Context Menu
 * Author: @sydcanem
 * https://github.com/sydcanem/bootstrap-contextmenu
 *
 * Inspired by Bootstrap's dropdown plugin.
 * Bootstrap (http://getbootstrap.com).
 *
 * Licensed under MIT
 * ========================================================= */

;(function ($) {

    'use strict';

    /* CONTEXTMENU CLASS DEFINITION
     * ============================ */
    var toggle = '[data-toggle="context"]';

    var ContextMenu = function (element, options) {
        this.$element = $(element);

        this.before = options.before || this.before;
        this.onItem = options.onItem || this.onItem;
        this.scopes = options.scopes || null;

        if (options.target) {
            this.$element.data('target', options.target);
        }

        this.listen();
    };

    ContextMenu.prototype = {

        constructor: ContextMenu
        , show: function (e) {

            var $menu
                , evt
                , tp
                , items
                , relatedTarget = {relatedTarget: this, target: e.currentTarget};

            if (this.isDisabled()) return;

            this.closemenu();

            if (this.before.call(this, e, $(e.currentTarget)) === false) return;

            $menu = this.getMenu();
            $menu.trigger(evt = $.Event('show.bs.context', relatedTarget));

            tp = this.getPosition(e, $menu);
            items = 'li:not(.divider)';
            $menu.attr('style', '')
                .css(tp)
                .addClass('open')
                .on('click.context.data-api', items, $.proxy(this.onItem, this, $(e.currentTarget)))
                .trigger('shown.bs.context', relatedTarget);

            // Delegating the `closemenu` only on the currently opened menu.
            // This prevents other opened menus from closing.
            $('html')
                .on('click.context.data-api', $menu.selector, $.proxy(this.closemenu, this));

            return false;
        }

        , closemenu: function (e) {
            var $menu
                , evt
                , items
                , relatedTarget;

            $menu = this.getMenu();

            if (!$menu.hasClass('open')) return;

            relatedTarget = {relatedTarget: this};
            $menu.trigger(evt = $.Event('hide.bs.context', relatedTarget));

            items = 'li:not(.divider)';
            $menu.removeClass('open')
                .off('click.context.data-api', items)
                .trigger('hidden.bs.context', relatedTarget);

            $('html')
                .off('click.context.data-api', $menu.selector);
            // Don't propagate click event so other currently
            // opened menus won't close.
            if (e) e.stopPropagation();
        }

        , keydown: function (e) {
            if (e.which == 27) this.closemenu(e);
        }

        , before: function (e) {
            return true;
        }

        , onItem: function (e) {
            return true;
        }

        , listen: function () {
            this.$element.on('contextmenu.context.data-api', this.scopes, $.proxy(this.show, this));
            $('html').on('click.context.data-api', $.proxy(this.closemenu, this));
            $('html').on('keydown.context.data-api', $.proxy(this.keydown, this));
        }

        , destroy: function () {
            this.$element.off('.context.data-api').removeData('context');
            $('html').off('.context.data-api');
        }

        , isDisabled: function () {
            return this.$element.hasClass('disabled') ||
                this.$element.attr('disabled');
        }

        , getMenu: function () {
            var selector = this.$element.data('target')
                , $menu;

            if (!selector) {
                selector = this.$element.attr('href');
                selector = selector && selector.replace(/.*(?=#[^\s]*$)/, ''); //strip for ie7
            }

            $menu = $(selector);

            return $menu && $menu.length ? $menu : this.$element.find(selector);
        }

        , getPosition: function (e, $menu) {
            var mouseX = e.clientX
                , mouseY = e.clientY
                , boundsX = $(window).width()
                , boundsY = $(window).height()
                , menuWidth = $menu.find('.dropdown-menu').outerWidth()
                , menuHeight = $menu.find('.dropdown-menu').outerHeight()
                , tp = {"position": "absolute", "z-index": 9999}
                , Y, X, parentOffset;

            if (mouseY + menuHeight > boundsY) {
                Y = {"top": mouseY - menuHeight + $(window).scrollTop()};
            } else {
                Y = {"top": mouseY + $(window).scrollTop()};
            }

            if ((mouseX + menuWidth > boundsX) && ((mouseX - menuWidth) > 0)) {
                X = {"left": mouseX - menuWidth + $(window).scrollLeft()};
            } else {
                X = {"left": mouseX + $(window).scrollLeft()};
            }

            // If context-menu's parent is positioned using absolute or relative positioning,
            // the calculated mouse position will be incorrect.
            // Adjust the position of the menu by its offset parent position.
            parentOffset = $menu.offsetParent().offset();
            X.left = X.left - parentOffset.left;
            Y.top = Y.top - parentOffset.top;

            return $.extend(tp, Y, X);
        }

    };

    /* CONTEXT MENU PLUGIN DEFINITION
     * ========================== */

    $.fn.contextmenu = function (option, e) {
        return this.each(function () {
            var $this = $(this)
                , data = $this.data('context')
                , options = (typeof option == 'object') && option;

            if (!data) $this.data('context', (data = new ContextMenu($this, options)));
            if (typeof option == 'string') data[option].call(data, e);
        });
    };

    $.fn.contextmenu.Constructor = ContextMenu;

    /* APPLY TO STANDARD CONTEXT MENU ELEMENTS
     * =================================== */

    $(document)
        .on('contextmenu.context.data-api', function () {
            $(toggle).each(function () {
                var data = $(this).data('context');
                if (!data) return;
                data.closemenu();
            });
        })
        .on('contextmenu.context.data-api', toggle, function (e) {
            $(this).contextmenu('show', e);

            e.preventDefault();
            e.stopPropagation();
        });

}(jQuery));