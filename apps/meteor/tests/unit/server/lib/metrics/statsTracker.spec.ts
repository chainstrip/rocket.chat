import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';
import sinon from 'sinon';

import statsTracker from '../../../../../server/lib/metrics/lib/statsTracker';

describe('statsTracker', () => {
	let send: sinon.SinonStub;

	afterEach(() => {
		send?.restore();
	});

	it('should create a StatsD client pointed at the default agent', () => {
		expect(statsTracker.dogstatsd).to.be.instanceOf(statsTracker.StatsD);
		expect(statsTracker.dogstatsd.host).to.be.equal('localhost');
		expect(statsTracker.dogstatsd.port).to.be.equal(8125);
	});

	it('should prefix counters with RocketChat and send them as counts', () => {
		send = sinon.stub(statsTracker.dogstatsd, 'send');

		statsTracker.increment('messages.sent');
		statsTracker.decrement('rooms.open');

		expect(send.callCount).to.be.equal(2);
		expect(send.firstCall.args[0]).to.deep.equal({ 'RocketChat.messages.sent': '1|c' });
		expect(send.secondCall.args[0]).to.deep.equal({ 'RocketChat.rooms.open': '-1|c' });
	});

	it('should send timings, gauges and histograms with their StatsD types', () => {
		send = sinon.stub(statsTracker.dogstatsd, 'send');

		statsTracker.timing('method.duration', 42);
		statsTracker.gauge('users.online', 7, ['env:test']);
		statsTracker.histogram('payload.size', 512);

		expect(send.firstCall.args[0]).to.deep.equal({ 'RocketChat.method.duration': '42|ms' });
		expect(send.secondCall.args[0]).to.deep.equal({ 'RocketChat.users.online': '7|g' });
		// StatsTracker passes tags in the position node-dogstatsd reads as the sample rate
		expect(send.secondCall.args[1]).to.deep.equal(['env:test']);
		expect(send.thirdCall.args[0]).to.deep.equal({ 'RocketChat.payload.size': '512|h' });
	});

	it('should report a monotonic microsecond clock', () => {
		const first = statsTracker.now();
		const second = statsTracker.now();

		expect(first).to.be.a('number');
		expect(second).to.be.at.least(first);
	});
});
