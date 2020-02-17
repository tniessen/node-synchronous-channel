const { spawnSync } = require('child_process');
const { readdirSync } = require('fs');
const path = require('path');

const tests = readdirSync(__dirname)
              .filter(name => name.startsWith('test-'))
              .map((name, i) => ({
                name,
                file: path.join(__dirname, name),
                index: i + 1
              }));

console.log(`1..${tests.length}`);
let failed = false;

for (const { name, file, index } of tests) {
  const { status, stdout } = spawnSync(process.argv[0], [file], {
    encoding: 'utf8'
  });

  if (status === 0 && stdout.trim() === 'ok') {
    console.log(`ok ${index} ${name}`);
  } else {
    console.log(`not ok ${index} ${name}`);
    failed = true;
  }
}

if (failed)
  process.exit(1);
