import type { NextHandleFunction } from 'connect';
import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

let handler: NextHandleFunction;

class ReactiveDictMock {
	private map = new Map<string, unknown>();

	get(key: string) {
		return this.map.get(key);
	}

	set(key: string, value: unknown) {
		this.map.set(key, value);
	}
}

const { addScript, addStyle, injectIntoHead, applyHeadInjections } = proxyquire.noCallThru().load('../../../../../server/lib/ui-master/inject', {
	'meteor/meteorhacks:inject-initial': { Inject: { rawBody: sinon.stub() } },
	'meteor/reactive-dict': { ReactiveDict: ReactiveDictMock },
	'meteor/webapp': {
		WebApp: {
			connectHandlers: {
				use: (fn: NextHandleFunction) => {
					handler = fn;
				},
			},
		},
	},
	'../utils/getURL': { getURL: (path: string) => `/${path}` },
});

const makeRes = () => ({
	writeHead: sinon.stub(),
	write: sinon.stub(),
	end: sinon.stub(),
});

describe('ui-master inject handler', () => {
	beforeEach(() => {
		injectIntoHead('script', '');
		injectIntoHead('style', '');
	});

	it('should serve a registered script by its hashed URL', () => {
		addScript('script', 'console.log("hi")');
		const res = makeRes();
		const next = sinon.stub();

		handler({ method: 'GET', url: '/script_0123abcd.js?cachebust=1' } as any, res as any, next);

		expect(next.called).to.be.equal(false);
		expect(res.writeHead.calledOnce).to.be.equal(true);
		expect(res.writeHead.firstCall.args[0]).to.be.equal(200);
		expect(res.writeHead.firstCall.args[1]).to.include({ 'Content-type': 'application/javascript; charset=UTF-8' });
		expect(res.write.firstCall.args[0]).to.be.equal('console.log("hi")');
		expect(res.end.calledOnce).to.be.equal(true);
	});

	it('should serve a registered stylesheet with a css content type', () => {
		addStyle('style', 'body { color: red; }');
		const res = makeRes();
		const next = sinon.stub();

		handler({ method: 'HEAD', url: '/style_deadbeef.css' } as any, res as any, next);

		expect(res.writeHead.firstCall.args[1]).to.include({ 'Content-type': 'text/css; charset=UTF-8' });
		expect(res.write.firstCall.args[0]).to.be.equal('body { color: red; }');
	});

	it('should pass through requests for unknown paths', () => {
		const res = makeRes();
		const next = sinon.stub();

		handler({ method: 'GET', url: '/unknown_path.js' } as any, res as any, next);

		expect(next.calledOnce).to.be.equal(true);
		expect(res.writeHead.called).to.be.equal(false);
	});

	it('should pass through non-GET requests', () => {
		addScript('script', 'x');
		const res = makeRes();
		const next = sinon.stub();

		handler({ method: 'POST', url: '/script_abc.js' } as any, res as any, next);

		expect(next.calledOnce).to.be.equal(true);
	});

	it('should pass through when the injection is empty', () => {
		addScript('script', '   ');
		const res = makeRes();
		const next = sinon.stub();

		handler({ method: 'GET', url: '/script_abc.js' } as any, res as any, next);

		expect(next.calledOnce).to.be.equal(true);
	});

	it('should build head tags for the registered injections', () => {
		addScript('script', 'alert(1)');
		const apply = applyHeadInjections([{ type: 'JS', tag: '<script id="script" src="/script_x.js"></script>', content: 'alert(1)' }, '<meta>']);

		expect(apply('<html><head></head></html>')).to.be.equal(
			'<html><head><script id="script" src="/script_x.js"></script>\n<meta>\n</head></html>',
		);
	});

	it('should reject keys containing underscores', () => {
		expect(() => addScript('bad_key', 'x')).to.throw();
		expect(() => addStyle('bad_key', 'x')).to.throw();
	});
});
