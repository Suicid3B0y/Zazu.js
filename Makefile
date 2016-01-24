NAME=zazu
HTTP_PORT=80
HTTPS_PORT=443

all: http

http: prepare build
	node app/zazu-server ${HTTP_PORT}

https: prepare build
	node app/zazu-server ${HTTPS_PORT}

prepare:
	mkdir -p app
	rm -rf app/**/*.js
	rm -rf app/**/*.css
	rm -rf app/**/*.html

build:
	grunt
	
