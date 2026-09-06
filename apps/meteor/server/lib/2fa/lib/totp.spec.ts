import { SHA256 } from '@rocket.chat/sha256';
import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const settingsGet = sinon.stub();
const update2FABackupCodesByUserId = sinon.stub().resolves();

const { TOTP } = proxyquire.noCallThru().load('./totp', {
	'@rocket.chat/models': {
		Users: { update2FABackupCodesByUserId },
	},
	'../../../settings': {
		settings: { get: settingsGet },
	},
});

// RFC 6238 test vector: ASCII secret "12345678901234567890" (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ)
// produces the SHA-1 code 287082 for the 30-second step that starts at T=30 (T=59 lies inside it).
const RFC6238_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RFC6238_TOKEN_AT_59S = '287082';

describe('TOTP', () => {
	let clock: sinon.SinonFakeTimers;

	beforeEach(() => {
		settingsGet.reset();
		update2FABackupCodesByUserId.resetHistory();
		clock = sinon.useFakeTimers({ now: 59 * 1000 });
	});

	afterEach(() => {
		clock.restore();
	});

	describe('generateSecret / generateOtpauthURL', () => {
		it('should generate a secret with ascii and base32 encodings', () => {
			const secret = TOTP.generateSecret();

			expect(secret).to.have.property('ascii').that.is.a('string').and.is.not.empty;
			expect(secret).to.have.property('base32').that.match(/^[A-Z2-7]+$/);
		});

		it('should build an otpauth URL labelled with the username', () => {
			const secret = TOTP.generateSecret();

			const url = TOTP.generateOtpauthURL(secret, 'rocket.cat');

			expect(url).to.match(/^otpauth:\/\/totp\//);
			expect(url).to.include('Rocket.Chat:rocket.cat');
			expect(url).to.include(`secret=${secret.base32}`);
		});
	});

	describe('verify', () => {
		it('should accept the current token for the secret', async () => {
			settingsGet.withArgs('Accounts_TwoFactorAuthentication_MaxDelta').returns(0);

			const result = await TOTP.verify({ secret: RFC6238_SECRET_BASE32, token: RFC6238_TOKEN_AT_59S });

			expect(result).to.be.equal(true);
		});

		it('should reject a wrong token', async () => {
			settingsGet.withArgs('Accounts_TwoFactorAuthentication_MaxDelta').returns(0);

			const result = await TOTP.verify({ secret: RFC6238_SECRET_BASE32, token: '000000' });

			expect(result).to.be.equal(false);
		});

		it('should reject a token from the previous step when no delta is allowed', async () => {
			settingsGet.withArgs('Accounts_TwoFactorAuthentication_MaxDelta').returns(0);
			clock.setSystemTime(89 * 1000);

			const result = await TOTP.verify({ secret: RFC6238_SECRET_BASE32, token: RFC6238_TOKEN_AT_59S });

			expect(result).to.be.equal(false);
		});

		it('should accept a token from the previous step when the delta setting allows it', async () => {
			settingsGet.withArgs('Accounts_TwoFactorAuthentication_MaxDelta').returns(1);
			clock.setSystemTime(89 * 1000);

			const result = await TOTP.verify({ secret: RFC6238_SECRET_BASE32, token: RFC6238_TOKEN_AT_59S });

			expect(result).to.be.equal(true);
		});

		it('should reject a token outside the allowed delta', async () => {
			settingsGet.withArgs('Accounts_TwoFactorAuthentication_MaxDelta').returns(1);
			clock.setSystemTime(149 * 1000);

			const result = await TOTP.verify({ secret: RFC6238_SECRET_BASE32, token: RFC6238_TOKEN_AT_59S });

			expect(result).to.be.equal(false);
		});

		it('should consume a valid backup code and persist the remaining ones', async () => {
			const backupTokens = [SHA256('abcd1234'), SHA256('wxyz9876')];

			const result = await TOTP.verify({ secret: RFC6238_SECRET_BASE32, token: 'abcd1234', backupTokens, userId: 'user-id' });

			expect(result).to.be.equal(true);
			expect(backupTokens).to.deep.equal([SHA256('wxyz9876')]);
			expect(update2FABackupCodesByUserId.calledOnceWithExactly('user-id', backupTokens)).to.be.equal(true);
		});

		it('should reject an unknown backup code without touching the stored codes', async () => {
			const backupTokens = [SHA256('abcd1234')];

			const result = await TOTP.verify({ secret: RFC6238_SECRET_BASE32, token: 'nope0000', backupTokens, userId: 'user-id' });

			expect(result).to.be.equal(false);
			expect(backupTokens).to.have.lengthOf(1);
			expect(update2FABackupCodesByUserId.called).to.be.equal(false);
		});
	});

	describe('generateCodes', () => {
		it('should generate 12 backup codes with matching hashes', () => {
			const { codes, hashedCodes } = TOTP.generateCodes();

			expect(codes).to.have.lengthOf(12);
			expect(hashedCodes).to.deep.equal(codes.map((code: string) => SHA256(code)));
		});
	});
});
