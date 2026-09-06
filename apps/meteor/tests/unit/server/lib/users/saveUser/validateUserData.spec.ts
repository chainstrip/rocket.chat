import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

class MeteorError extends Error {
	constructor(
		public error: string,
		public reason?: string,
		public details?: unknown,
	) {
		super(reason);
	}
}

const settingsValues: Record<string, unknown> = {
	Accounts_RequireNameForSignUp: false,
	UTF8_User_Names_Validation: '[0-9a-zA-Z-_.]+',
};
const settingsGet = sinon.stub().callsFake((key: string) => settingsValues[key]);
const hasPermissionAsync = sinon.stub().resolves(true);
const checkUsernameAvailability = sinon.stub().resolves(true);
const checkEmailAvailability = sinon.stub().resolves(true);

const { validateUserData } = proxyquire.noCallThru().load('../../../../../../server/lib/users/saveUser/validateUserData', {
	'@rocket.chat/core-services': { MeteorError },
	'./saveUser': { isUpdateUserData: (data: { _id?: string }) => Boolean(data._id) },
	'../../../settings': { settings: { get: settingsGet } },
	'../../authorization/getRoles': { getRoleIds: sinon.stub().resolves(['user', 'admin']) },
	'../../authorization/hasPermission': { hasPermissionAsync },
	'../checkEmailAvailability': { checkEmailAvailability },
	'../checkUsernameAvailability': { checkUsernameAvailability },
});

const expectRejection = async (promise: Promise<unknown>): Promise<MeteorError> => {
	try {
		await promise;
	} catch (e) {
		return e as MeteorError;
	}
	throw new Error('expected the promise to reject');
};

describe('validateUserData', () => {
	beforeEach(() => {
		hasPermissionAsync.resolves(true);
		checkUsernameAvailability.resolves(true);
		checkEmailAvailability.resolves(true);
	});

	it('should accept a valid new user', async () => {
		await validateUserData('admin-id', { username: 'new.user', name: 'New', email: 'new@example.com', password: 'p4ssw0rd', roles: ['user'] });
	});

	it('should escape the username in the invalid-username error', async () => {
		const error = await expectRejection(validateUserData('admin-id', { username: '<script>&"x"', name: 'Bad', password: 'p4ssw0rd' }));

		expect(error.error).to.be.equal('error-input-is-not-a-valid-field');
		expect(error.reason).to.be.equal('&lt;script&gt;&amp;&quot;x&quot; is not a valid username');
	});

	it('should escape the username in the already-in-use error', async () => {
		checkUsernameAvailability.resolves(false);

		const error = await expectRejection(validateUserData('admin-id', { username: 'taken', name: 'Taken', password: 'p4ssw0rd' }));

		expect(error.error).to.be.equal('error-field-unavailable');
		expect(error.reason).to.be.equal('taken is already in use :(');
	});

	it('should escape the email in the already-in-use error', async () => {
		checkEmailAvailability.resolves(false);

		const error = await expectRejection(
			validateUserData('admin-id', { username: 'fine', name: 'Fine', email: "o'neil@example.com", password: 'p4ssw0rd' }),
		);

		expect(error.error).to.be.equal('error-field-unavailable');
		expect(error.reason).to.be.equal('o&#39;neil@example.com is already in use :(');
	});

	it('should reject unknown roles', async () => {
		const error = await expectRejection(validateUserData('admin-id', { username: 'fine', name: 'Fine', password: 'p4ssw0rd', roles: ['ghost'] }));

		expect(error.error).to.be.equal('error-action-not-allowed');
		expect(error.details).to.include({ action: 'Assign_role' });
	});

	it('should require create-user permission for a new user', async () => {
		hasPermissionAsync.withArgs('user-id', 'create-user').resolves(false);

		const error = await expectRejection(validateUserData('user-id', { username: 'fine', name: 'Fine', password: 'p4ssw0rd' }));

		expect(error.details).to.include({ action: 'Adding_user' });
	});
});
