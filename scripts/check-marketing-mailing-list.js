const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.DB_PATH = process.env.DB_PATH
  || path.join(os.tmpdir(), `vellic-mailing-list-check-${process.pid}.db`);

const mailingListStore = require('../stores/marketingMailingListStore');

async function main() {
  await mailingListStore.ensureMarketingMailingListSchemaAsync();

  assert.strictEqual(mailingListStore.isValidEmail('not-an-email'), false);
  assert.strictEqual(mailingListStore.isValidEmail('person@example.com'), true);

  const first = await mailingListStore.createOrGetSignupAsync({
    email: 'Person@Example.COM ',
    source: 'check',
    routePath: '/features',
  });
  assert.strictEqual(first.alreadySubscribed, false);
  assert.strictEqual(first.signup.email, 'person@example.com');

  const duplicate = await mailingListStore.createOrGetSignupAsync({
    email: 'person@example.com',
    source: 'check',
    routePath: '/features',
  });
  assert.strictEqual(duplicate.alreadySubscribed, true);
  assert.strictEqual(duplicate.signup.id, first.signup.id);

  console.log('Marketing mailing list store check passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
