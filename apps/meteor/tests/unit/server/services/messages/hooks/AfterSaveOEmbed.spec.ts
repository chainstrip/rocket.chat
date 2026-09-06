import { expect } from 'chai';
import iconv from 'iconv-lite';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const settingsValues: Record<string, unknown> = {
	API_EmbedIgnoredHosts: '',
	API_EmbedSafePorts: '80, 443',
	API_Embed_UserAgent: 'Rocket.Chat-bot',
	Language: 'en',
	API_EmbedTimeout: 15,
	SSRF_Allowlist: '',
	Allow_Invalid_SelfSigned_Certs: false,
	API_Embed: true,
	Site_Url: 'http://localhost:3000',
};
const settingsGet = sinon.stub().callsFake((key: string) => settingsValues[key]);
const serverFetch = sinon.stub();
const findOneById = sinon.stub().resolves(null);
const createWithIdAndData = sinon.stub().resolves(undefined);
const setUrlsById = sinon.stub().resolves(undefined);

const { OEmbed } = proxyquire.noCallThru().load('../../../../../../server/services/messages/hooks/AfterSaveOEmbed', {
	'@rocket.chat/logger': {
		Logger: class {
			debug() {
				// no-op
			}

			info() {
				// no-op
			}

			warn() {
				// no-op
			}

			error() {
				// no-op
			}
		},
	},
	'@rocket.chat/models': {
		OEmbedCache: { findOneById, createWithIdAndData },
		Messages: { setUrlsById },
	},
	'@rocket.chat/server-fetch': { serverFetch },
	'../../../../app/utils/rocketchat.info': { Info: { version: '7.0.0' } },
	'../../../settings': { settings: { get: settingsGet } },
	'../lib/oembed/providers': {
		beforeGetUrlContent: ({ urlObj }: { urlObj: URL }) => ({ urlObj }),
		afterParseUrlContent: (data: unknown) => data,
	},
});

const htmlResponse = (html: string, charset: string, contentType: string) => ({
	status: 200,
	headers: new Headers({ 'content-type': contentType, 'content-length': String(html.length) }),
	body: [iconv.encode(html, charset)],
});

describe('OEmbed.parseUrl', () => {
	beforeEach(() => {
		serverFetch.reset();
		findOneById.reset();
		findOneById.resolves(null);
		createWithIdAndData.resetHistory();
		setUrlsById.resetHistory();
	});

	it('should decode a latin1 page using the charset detected from the body and header', async () => {
		serverFetch.resolves(
			htmlResponse(
				'<html><head><meta charset="iso-8859-1"><title>Café Ünïcode</title><meta property="og:title" content="Café" /><meta name="description" content="Crème brûlée" /></head><body>Voilà, déjà vu à Zürich.</body></html>',
				'iso-8859-1',
				'text/html; charset=iso-8859-1',
			),
		);

		const { urlPreview, foundMeta } = await OEmbed.parseUrl('https://example.com/page');

		expect(foundMeta).to.be.equal(true);
		expect(urlPreview.meta).to.include({ pageTitle: 'Café Ünïcode', ogTitle: 'Café', description: 'Crème brûlée' });
		expect(urlPreview.headers).to.include({ contentType: 'text/html; charset=iso-8859-1' });
		expect(createWithIdAndData.calledOnce).to.be.equal(true);
		expect(createWithIdAndData.firstCall.args[0]).to.be.equal('https://example.com/page');

		const [url, options] = serverFetch.firstCall.args;
		expect(url).to.be.equal('https://example.com/page');
		expect(options.headers['User-Agent']).to.be.equal('Rocket.Chat-bot Rocket.Chat/7.0.0');
	});

	it('should fall back to utf-8 when the page declares no charset', async () => {
		serverFetch.resolves(
			htmlResponse('<html><head><title>Ünïcödé</title><meta name="twitter:card" content="summary"></head></html>', 'utf-8', 'text/html'),
		);

		const { urlPreview, foundMeta } = await OEmbed.parseUrl('https://example.com/utf8');

		expect(foundMeta).to.be.equal(true);
		expect(urlPreview.meta).to.include({ pageTitle: 'Ünïcödé', twitterCard: 'summary' });
	});

	it('should return no metadata when the page has no relevant tags', async () => {
		serverFetch.resolves(htmlResponse('<html><body>nothing here</body></html>', 'utf-8', 'text/html'));

		const { urlPreview, foundMeta } = await OEmbed.parseUrl('https://example.com/empty');

		expect(foundMeta).to.be.equal(true);
		expect(urlPreview.meta).to.deep.equal({});
	});

	it('should not fetch a relative URL', async () => {
		const { urlPreview, foundMeta } = await OEmbed.parseUrl('/relative/path');

		expect(foundMeta).to.be.equal(false);
		expect(urlPreview).to.deep.equal({ url: '/relative/path', meta: {} });
		expect(serverFetch.called).to.be.equal(false);
	});

	it('should return no metadata for an ignored host', async () => {
		settingsValues.API_EmbedIgnoredHosts = 'example.com';
		try {
			const { foundMeta } = await OEmbed.parseUrl('https://example.com/ignored');

			expect(foundMeta).to.be.equal(false);
			expect(serverFetch.called).to.be.equal(false);
		} finally {
			settingsValues.API_EmbedIgnoredHosts = '';
		}
	});

	it('should reuse cached metadata', async () => {
		findOneById.resolves({ data: { url: 'https://example.com/cached', meta: { ogTitle: 'Cached' }, headers: {} } });

		const { urlPreview, foundMeta } = await OEmbed.parseUrl('https://example.com/cached');

		expect(foundMeta).to.be.equal(true);
		expect(urlPreview.meta).to.deep.equal({ ogTitle: 'Cached' });
		expect(serverFetch.called).to.be.equal(false);
	});
});
