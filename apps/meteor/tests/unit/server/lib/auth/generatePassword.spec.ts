import { PasswordPolicy } from '@rocket.chat/password-policies';
import { expect } from 'chai';
import { describe, it } from 'mocha';
import proxyquire from 'proxyquire';

const loadWithPolicy = (policy: PasswordPolicy): (() => string) => {
	const { generatePassword } = proxyquire.noCallThru().load('../../../../../server/lib/auth/generatePassword', {
		'./passwordPolicy': { passwordPolicy: policy },
	});
	return generatePassword;
};

describe('generatePassword', () => {
	it('should generate a 17 character password when the password policy is disabled', () => {
		const generatePassword = loadWithPolicy(new PasswordPolicy({ enabled: false, throwError: false }));

		const password = generatePassword();

		expect(password).to.be.a('string').with.lengthOf(17);
	});

	it('should generate a password that satisfies an enabled policy', () => {
		const policy = new PasswordPolicy({
			enabled: true,
			minLength: 14,
			maxLength: 20,
			forbidRepeatingCharacters: true,
			forbidRepeatingCharactersCount: 3,
			mustContainAtLeastOneLowercase: true,
			mustContainAtLeastOneUppercase: true,
			mustContainAtLeastOneNumber: true,
			mustContainAtLeastOneSpecialCharacter: true,
			throwError: false,
		});
		const generatePassword = loadWithPolicy(policy);

		const password = generatePassword();

		expect(password).to.have.lengthOf(14);
		expect(password).to.match(/[a-z]/);
		expect(password).to.match(/[A-Z]/);
		expect(password).to.match(/[0-9]/);
		expect(password).to.match(/[^a-zA-Z0-9]/);
		expect(policy.validate(password)).to.be.equal(true);
	});

	it('should use the minimum length of 12 when the policy minimum is lower', () => {
		const policy = new PasswordPolicy({
			enabled: true,
			minLength: 6,
			maxLength: -1,
			mustContainAtLeastOneNumber: true,
			throwError: false,
		});
		const generatePassword = loadWithPolicy(policy);

		const password = generatePassword();

		expect(password).to.have.lengthOf(12);
		expect(password).to.match(/[0-9]/);
		expect(policy.validate(password)).to.be.equal(true);
	});
});
