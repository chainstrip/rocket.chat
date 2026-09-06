import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

import type { LocalStore as LocalStoreClass } from './ufs-local';

const meteorStubs = {
	'meteor/meteor': {},
	'meteor/check': {},
	'meteor/mongo': {},
	'meteor/npm-mongo': {},
};

const ufsFilterMock = proxyquire.noCallThru().load('./ufs-filter', meteorStubs);
const { UploadFS } = proxyquire.noCallThru().load('./ufs', {
	...meteorStubs,
	'./ufs-filter': ufsFilterMock,
	'./ufs-store': { Store: Object },
});
const ufsStoreMockRaw = proxyquire.noCallThru().load('./ufs-store', {
	...meteorStubs,
	'./ufs': { UploadFS },
	'./ufs-filter': ufsFilterMock,
	'./index': { UploadFS },
});
const { LocalStore } = proxyquire.noCallThru().load('./ufs-local', {
	...meteorStubs,
	'./ufs': { UploadFS },
	'./ufs-store': Object.assign({}, ufsStoreMockRaw, { default: ufsStoreMockRaw }),
	'./index': { UploadFS },
}) as { LocalStore: typeof LocalStoreClass };

const fakeCollection = { removeById: sinon.stub().resolves(), findOne: sinon.stub().resolves(null) };

describe('LocalStore directory creation', () => {
	let root: string;
	let info: sinon.SinonStub;

	afterEach(() => {
		info?.restore();
		if (root) {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it('should create the missing upload directory, parents included, with the configured mode', async () => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'ufs-local-'));
		const storePath = path.join(root, 'nested', 'deeper', 'uploads');

		let created!: (message: string) => void;
		const createdMessage = new Promise<string>((resolve) => {
			created = resolve;
		});
		info = sinon.stub(console, 'info').callsFake((message: string) => created(message));

		const store = new LocalStore({ name: 'test', collection: fakeCollection as any, path: storePath, mode: '0750' });

		expect(await createdMessage).to.be.equal(`LocalStore: store created at ${storePath}`);
		expect(fs.statSync(storePath).isDirectory()).to.be.equal(true);
		if (process.platform !== 'win32') {
			expect(fs.statSync(storePath).mode & 0o777).to.be.equal(0o750);
		}
		expect(store.getPath('file-id')).to.be.equal(`${storePath}/file-id`);
		expect(store.getPath()).to.be.equal(storePath);
	});
});
