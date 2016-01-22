NAME=zazu
VERSION=0.0.6
HTTP_PORT=8080
HTTPS_PORT=443

all: prepare build launchHTTP

https: prepare build launchHTTPS

prepare:
	mkdir -p app
	rm -rf app/**/*.js
	rm -rf app/**/*.css
	rm -rf app/**/*.html

build:
	grunt

launchHTTP:
	node app/zazu-server ${HTTP_PORT}

launchHTTPS:
	node app/zazu-server ${HTTP_PORTS}
