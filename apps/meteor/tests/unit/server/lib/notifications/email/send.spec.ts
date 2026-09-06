import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const settingsValues: Record<string, unknown> = {
	Site_Name: 'Rocket.Chat',
	Site_Url: 'http://localhost:3000',
	email_plain_text_only: true,
	email_style: '',
};
const settingsGet = sinon.stub().callsFake((key: string) => settingsValues[key]);

type SentEmail = { to: string | string[]; from: string; subject: string; html?: string; text?: string };

let capture: { promise: Promise<SentEmail>; resolve: (email: SentEmail) => void };
const armCapture = () => {
	let resolve!: (email: SentEmail) => void;
	const promise = new Promise<SentEmail>((r) => {
		resolve = r;
	});
	capture = { promise, resolve };
};

const sendAsync = sinon.stub().callsFake((email: SentEmail) => {
	capture.resolve(email);
	return Promise.resolve();
});

class MeteorError extends Error {}

const { send, sendNoWrap } = proxyquire.noCallThru().load('../../../../../../server/lib/notifications/email/api', {
	'@rocket.chat/apps': { Apps: { self: undefined }, AppEvents: { IPreEmailSent: 'IPreEmailSent' } },
	'@rocket.chat/models': { Settings: { incrementValueById: sinon.stub().resolves(null) } },
	'meteor/email': { Email: { sendAsync } },
	'meteor/meteor': { Meteor: { Error: MeteorError } },
	'../../../settings': {
		settings: {
			get: settingsGet,
			watch: () => undefined,
			watchMultiple: () => undefined,
		},
	},
	'../../i18n': { i18n: { t: (key: string) => key } },
	'../../notifyListener': { notifyOnSettingChanged: sinon.stub() },
});

describe('email api send', () => {
	beforeEach(() => {
		sendAsync.resetHistory();
		armCapture();
	});

	it('should derive the plain text from the html and replace variables', async () => {
		await send({
			to: 'user@example.com',
			from: 'noreply@example.com',
			subject: 'Hello [name]',
			html: '<p>Welcome <b>[name]</b> to [Site_Name]!</p><script>alert(1)</script>',
			data: { name: 'Ada Lovelace' },
		});

		const email = await capture.promise;

		expect(email.subject).to.be.equal('Hello Ada Lovelace');
		expect(email.text).to.be.equal('Welcome Ada Lovelace to Rocket.Chat!');
		expect(email.html).to.be.equal(undefined);
		expect(email.to).to.be.equal('user@example.com');
	});

	it('should keep the provided text and strip only when text is missing', async () => {
		await sendNoWrap({
			to: ['a@example.com', 'b@example.com'],
			from: 'noreply@example.com',
			subject: 'Plain',
			html: '<div>Line one<br>Line <i>two</i></div>',
		});

		const email = await capture.promise;

		expect(email.text).to.be.equal('Line one Line two');
	});

	it('should reject an invalid recipient address', async () => {
		let error: unknown;
		try {
			await send({ to: 'not-an-email', from: 'noreply@example.com', subject: 'x', html: '<p>x</p>' });
		} catch (e) {
			error = e;
		}

		expect(error).to.be.instanceOf(MeteorError);
		expect(sendAsync.called).to.be.equal(false);
	});
});
