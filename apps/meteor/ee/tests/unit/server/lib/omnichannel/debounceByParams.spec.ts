import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import sinon from 'sinon';

import { memoizeDebounce } from '../../../../../server/lib/omnichannel/debounceByParams';

describe('memoizeDebounce', () => {
	let clock: sinon.SinonFakeTimers;

	beforeEach(() => {
		clock = sinon.useFakeTimers();
	});

	afterEach(() => {
		clock.restore();
	});

	it('should call the function once per distinct set of params after the wait', () => {
		const fn = sinon.spy();
		const debounced = memoizeDebounce(fn, 100);

		debounced('room-a');
		debounced('room-a');
		debounced('room-b');

		expect(fn.called).to.be.equal(false);

		clock.tick(100);

		expect(fn.callCount).to.be.equal(2);
		expect(fn.firstCall.args).to.deep.equal(['room-a']);
		expect(fn.secondCall.args).to.deep.equal(['room-b']);
	});

	it('should restart the wait when the same params are called again', () => {
		const fn = sinon.spy();
		const debounced = memoizeDebounce(fn, 100);

		debounced('room-a');
		clock.tick(60);
		debounced('room-a');
		clock.tick(60);

		expect(fn.called).to.be.equal(false);

		clock.tick(40);

		expect(fn.calledOnceWithExactly('room-a')).to.be.equal(true);
	});

	it('should flush a pending call for the given params immediately', () => {
		const fn = sinon.spy();
		const debounced = memoizeDebounce(fn, 100);

		debounced('room-a');
		debounced('room-b');
		debounced.flush('room-a');

		expect(fn.calledOnceWithExactly('room-a')).to.be.equal(true);

		clock.tick(100);

		expect(fn.callCount).to.be.equal(2);
		expect(fn.secondCall.args).to.deep.equal(['room-b']);
	});

	it('should honour leading-edge options', () => {
		const fn = sinon.spy();
		const debounced = memoizeDebounce(fn, 100, { leading: true, trailing: false });

		debounced('room-a');
		debounced('room-a');

		expect(fn.calledOnceWithExactly('room-a')).to.be.equal(true);

		clock.tick(100);

		expect(fn.callCount).to.be.equal(1);
	});
});
