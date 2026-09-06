import { expect } from 'chai';
import { describe, it } from 'mocha';
import sinon from 'sinon';

import { WebdavClientAdapter } from '../../../../../server/bridges/webdav/lib/webdavClientAdapter';

describe('WebdavClientAdapter', () => {
	it('should create a client with username and password credentials', () => {
		const adapter = new WebdavClientAdapter('https://cloud.example.com/remote.php/dav', { username: 'alice', password: 'secret' });

		expect(adapter._client).to.be.an('object');
		expect(adapter._client.stat).to.be.a('function');
		expect(adapter._client.getDirectoryContents).to.be.a('function');
	});

	it('should create a client with a token credential', () => {
		const adapter = new WebdavClientAdapter('https://cloud.example.com/remote.php/dav', {
			token: { access_token: 'abc', token_type: 'Bearer' },
		});

		expect(adapter._client.customRequest).to.be.a('function');
		expect(adapter._client.createReadStream).to.be.a('function');
	});

	it('should surface the server status text when a request fails', async () => {
		const adapter = new WebdavClientAdapter('https://cloud.example.com/remote.php/dav', { username: 'alice', password: 'secret' });
		sinon.stub(adapter._client, 'stat').rejects({ response: { statusText: 'Not Found' } });

		let error: Error | undefined;
		try {
			await adapter.stat('/missing');
		} catch (e) {
			error = e as Error;
		}

		expect(error?.message).to.be.equal('Not Found');
	});

	it('should use a default message when the failure carries no response', async () => {
		const adapter = new WebdavClientAdapter('https://cloud.example.com/remote.php/dav', { username: 'alice', password: 'secret' });
		sinon.stub(adapter._client, 'getFileContents').rejects(new Error('socket hang up'));

		let error: Error | undefined;
		try {
			await adapter.getFileContents('/file.txt');
		} catch (e) {
			error = e as Error;
		}

		expect(error?.message).to.be.equal('Error getting file contents webdav');
	});

	it('should pass through successful results', async () => {
		const adapter = new WebdavClientAdapter('https://cloud.example.com/remote.php/dav', { username: 'alice', password: 'secret' });
		const contents = [{ filename: '/a.txt', basename: 'a.txt', type: 'file' }];
		sinon.stub(adapter._client, 'getDirectoryContents').resolves(contents as any);

		expect(await adapter.getDirectoryContents('/')).to.deep.equal(contents);
	});
});
