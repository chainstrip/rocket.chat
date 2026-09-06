import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

type Migration = { version: number; up: () => Promise<void> };
let migration: Migration;

const findOneById = sinon.stub();
const updateOne = sinon.stub().resolves(undefined);

proxyquire.noCallThru().load('../../../../../server/startup/migrations/v308', {
	'@rocket.chat/models': { Settings: { findOneById, updateOne } },
	'../../lib/migrations': {
		addMigration: (m: Migration) => {
			migration = m;
		},
	},
});

const setFor = (id: string) => updateOne.getCalls().find((call) => call.args[0]._id === id)?.args[1].$set;

describe('migration v308', () => {
	beforeEach(() => {
		findOneById.reset();
		updateOne.resetHistory();
	});

	it('should register as version 308', () => {
		expect(migration.version).to.be.equal(308);
	});

	it('should keep valid cron expressions and only update the package value', async () => {
		findOneById.withArgs('LDAP_Background_Sync_Avatars_Interval').resolves({ value: '30 2 * * 1-5' });
		findOneById.withArgs('LDAP_Sync_AutoLogout_Interval').resolves({ value: '*/15 * * * *' });

		await migration.up();

		expect(setFor('LDAP_Background_Sync_Avatars_Interval')).to.deep.equal({ packageValue: '0 0 * * *' });
		expect(setFor('LDAP_Sync_AutoLogout_Interval')).to.deep.equal({ packageValue: '*/5 * * * *' });
	});

	it('should replace legacy interval names that are not cron expressions', async () => {
		findOneById.withArgs('LDAP_Background_Sync_Avatars_Interval').resolves({ value: 'every_24_hours' });
		findOneById.withArgs('LDAP_Sync_AutoLogout_Interval').resolves({ value: 'every_5_minutes' });

		await migration.up();

		expect(setFor('LDAP_Background_Sync_Avatars_Interval')).to.deep.equal({ packageValue: '0 0 * * *', value: '0 0 * * *' });
		expect(setFor('LDAP_Sync_AutoLogout_Interval')).to.deep.equal({ packageValue: '*/5 * * * *', value: '*/5 * * * *' });
	});

	it('should reset the value when the setting is missing', async () => {
		findOneById.resolves(null);

		await migration.up();

		expect(setFor('LDAP_Background_Sync_Avatars_Interval')).to.deep.equal({ packageValue: '0 0 * * *', value: '0 0 * * *' });
	});

	it('should reject a malformed cron expression', async () => {
		findOneById.withArgs('LDAP_Background_Sync_Avatars_Interval').resolves({ value: '99 99 * * *' });
		findOneById.withArgs('LDAP_Sync_AutoLogout_Interval').resolves({ value: '0 0 * * *' });

		await migration.up();

		expect(setFor('LDAP_Background_Sync_Avatars_Interval')).to.deep.equal({ packageValue: '0 0 * * *', value: '0 0 * * *' });
		expect(setFor('LDAP_Sync_AutoLogout_Interval')).to.deep.equal({ packageValue: '*/5 * * * *' });
	});
});
