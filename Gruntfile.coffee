module.exports = (grunt) ->

  grunt.initConfig
    pkg: grunt.file.readJSON 'package.json'


    uglify:
      options:
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("dd-mm-yyyy") %> */\n'
      dist:
        files:
          'app/js/<%= pkg.name %>.min.js': ['<%= concat.distJS.dest %>']


    cssmin:
      options:
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("dd-mm-yyyy") %> */\n'
      dist:
        files:
          'app/css/<%= pkg.name %>.min.css': ['<%= concat.distCSS.dest %>']


    concat:
      distJS:
        src: ['src/**/*.js', '!src/server.js']
        dest: 'app/<%= pkg.name %>.js'
      distCSS:
        src: ['src/css/awesome-bootstrap-checkbox.css', 'src/css/client.css']
        dest: 'app/<%= pkg.name %>.css'


    coffee:
      default:
        expand: true,
        src: ['src/**/*.coffee']
        dest: 'app/'
        ext: '.js'
        options:
          bare: true


    copy:
      default:
        files:
          [
            {src: 'src/server.js', dest: 'app/zazu-server.js'},
            {expand: true, cwd: 'src/views/', src: ['**'], dest: 'app/views/'},
            {expand: true, cwd: 'src/fonts/', src: ['**'], dest: 'app/fonts/'},
            {src: ['src/defaultRooms.json'], dest: 'app/defaultRooms.json'},
            {src: ['src/css/bootstrap.min.css'], dest: 'app/css/bootstrap.min.css'}
          ]

  grunt.loadNpmTasks 'grunt-contrib-uglify'
  grunt.loadNpmTasks 'grunt-contrib-cssmin'
  grunt.loadNpmTasks 'grunt-contrib-concat'
  grunt.loadNpmTasks 'grunt-contrib-coffee'
  grunt.loadNpmTasks 'grunt-contrib-copy'

  grunt.registerTask 'default', ['concat', 'uglify', 'cssmin', 'copy']
