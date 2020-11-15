const mini = require('minimist')

function onclose(err) {
  if (err) {
    console.error(err)
    process.exit(1)
  } else {
    process.exit(0)
  }

  process.stdin.destroy()
  process.stdout.destroy()
}

function streamToObject(read) {
  return new Promise((res, rej) => {
    let str = ''
    read.on('error', rej)
    read.on('readable', function () {
      let chunk = null
      while ((chunk = read.read()) !== null) {
        str += chunk
      }
    })
    read.on('end', res(JSON.parse(str)))
  })
}

let about = {
  type : ['website', 'rw-publisher'],
  title : 'RadioWitness',
  description : 'Immutable, peer-to-peer archiving and distribution of police radio calls.',
  web_root : '/',
  fallback_page : '/assets/404.html',
  links : { publisher : [] }
}

let argv = mini(process.argv.slice(2))
let cmderr = 'expecting command: json <dat://author.key>'
if (argv._.length <= 1) { onclose(cmderr) }

switch (argv._[0]) {
  case 'json':
    about.links.publisher.push({ type : 'rw-author', href : argv._[1]})
    if (argv.studio) {
      about.links.publisher.push({ type : 'rw-studio', href : argv.studio })
    }
    if (argv.index) {
      about.links.publisher.push({ type : 'rw-studio-index', href : argv.index })
    }

    process.stdout.write(JSON.stringify(about))
    break;

  default:
    onclose(cmderr)
}
