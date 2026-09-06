import { expect } from 'chai';
import { describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const settingsValues: Record<string, unknown> = {
	CROWD_URL: 'https://crowd.example.com/crowd',
	CROWD_APP_USERNAME: 'rocketchat',
	CROWD_APP_PASSWORD: 'app-secret',
	CROWD_Reject_Unauthorized: true,
};
const settingsGet = sinon.stub().callsFake((key: string) => settingsValues[key]);
const logger = { debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };

const { CROWD } = proxyquire.noCallThru().load('../../../../../../server/lib/auth-providers/crowd/crowd', {
	'@rocket.chat/cron': { cronJobs: {} },
	'@rocket.chat/models': { Users: {} },
	'meteor/accounts-base': { Accounts: { registerLoginHandler: sinon.stub(), _runLoginHandlers: sinon.stub() } },
	'meteor/meteor': { Meteor: { Error, startup: sinon.stub() } },
	'./logger': { logger },
	'../../../settings': { settings: { get: settingsGet } },
	'../../../settings/crowd': { crowdIntervalValuesToCronMap: {} },
	'../../notifyListener': { notifyOnUserChange: sinon.stub(), notifyOnUserChangeById: sinon.stub(), notifyOnUserChangeAsync: sinon.stub() },
	'../../users/deleteUser': { deleteUser: sinon.stub() },
	'../../users/setRealName': { setRealName: sinon.stub() },
	'../../users/setUserActiveStatus': { setUserActiveStatus: sinon.stub() },
});

describe('CROWD', () => {
	it('should build the crowd client options from settings, adding a trailing slash to the base URL', () => {
		const crowd = new CROWD();

		const { options } = crowd as any;
		expect(options.crowd.base).to.be.equal('https://crowd.example.com/crowd/');
		expect(options.application).to.include({ name: 'rocketchat', password: 'app-secret' });
		expect(options.rejectUnauthorized).to.be.equal(true);
		// the crowd client parses the base URL into connection details on the shared options object
		expect(options).to.include({ hostname: 'crowd.example.com', port: 443, protocol: 'https:', pathname: '/crowd/' });
		const client = (crowd as any).crowdClient;
		expect(client).to.be.an('object');
		expect(client.ping).to.be.a('function');
		expect(client.user.find).to.be.a('function');
		expect(client.search).to.be.a('function');
	});

	it('should keep a base URL that already ends with a slash', () => {
		settingsValues.CROWD_URL = 'https://crowd.example.com/';
		try {
			const crowd = new CROWD();

			expect((crowd as any).options.crowd.base).to.be.equal('https://crowd.example.com/');
		} finally {
			settingsValues.CROWD_URL = 'https://crowd.example.com/crowd';
		}
	});

	it('should map a crowd user response to the internal shape', async () => {
		const crowd = new CROWD();
		sinon.stub((crowd as any).crowdClient.user, 'find').callsFake((_username: string, cb: (err: unknown, user: unknown) => void) =>
			cb(null, { 'display-name': 'Alice Liddell', 'name': 'alice', 'email': 'alice@example.com', 'active': true }),
		);

		const user = await crowd.fetchCrowdUser('alice');

		expect(user).to.deep.equal({
			displayname: 'Alice Liddell',
			username: 'alice',
			email: 'alice@example.com',
			active: true,
			crowd_username: 'alice',
		});
	});

	it('should reject checkConnection when ping fails', async () => {
		const crowd = new CROWD();
		sinon.stub((crowd as any).crowdClient, 'ping').callsFake((cb: (err: unknown) => void) => cb(new Error('unreachable')));

		let error: Error | undefined;
		try {
			await crowd.checkConnection();
		} catch (e) {
			error = e as Error;
		}

		expect(error?.message).to.be.equal('unreachable');
	});

	it('should refuse to authenticate without credentials', async () => {
		const crowd = new CROWD();

		expect(await crowd.authenticate('', 'x')).to.be.equal(undefined);
		expect(await crowd.authenticate('alice', '')).to.be.equal(undefined);
	});
});
