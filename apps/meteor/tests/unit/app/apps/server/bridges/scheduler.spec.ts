import { ObjectId } from 'bson';
import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const cancel = sinon.stub().resolves(1);
const start = sinon.stub().resolves(undefined);

class AgendaMock {
	cancel = cancel;

	start = start;

	define = sinon.stub();
}

const { AppSchedulerBridge } = proxyquire.noCallThru().load('../../../../../../app/apps/server/bridges/scheduler', {
	'@rocket.chat/agenda': { Agenda: AgendaMock },
	'@rocket.chat/apps/dist/server/bridges/SchedulerBridge': { SchedulerBridge: class {} },
	'@rocket.chat/apps-engine/definition/scheduler': { StartupType: { ONETIME: 'onetime', RECURRING: 'recurring' } },
	'meteor/mongo': {
		MongoInternals: {
			defaultRemoteCollectionDriver: () => ({ mongo: { client: { db: () => ({}) } } }),
		},
	},
});

const orch = {
	debugLog: sinon.stub(),
	getRocketChatLogger: () => ({ error: sinon.stub() }),
};

describe('AppSchedulerBridge.cancelJob', () => {
	beforeEach(() => {
		cancel.resetHistory();
		start.resetHistory();
	});

	it('should cancel by document id when the job id is an ObjectId', async () => {
		const bridge = new AppSchedulerBridge(orch);
		const hex = '507f1f77bcf86cd799439011';

		await (bridge as any).cancelJob(`${hex}_ignored-suffix`, 'app-id');

		expect(start.calledOnce).to.be.equal(true);
		expect(cancel.calledOnce).to.be.equal(true);
		const query = cancel.firstCall.args[0];
		expect(query._id).to.be.instanceOf(ObjectId);
		expect(query._id.toHexString()).to.be.equal(hex);
	});

	it('should cancel by name when the job id is not an ObjectId', async () => {
		const bridge = new AppSchedulerBridge(orch);

		await (bridge as any).cancelJob('daily-cleanup', 'app-id');

		expect(cancel.firstCall.args[0]).to.deep.equal({ name: 'daily-cleanup' });
	});

	it('should log and swallow a scheduler failure', async () => {
		const error = sinon.stub();
		const bridge = new AppSchedulerBridge({ ...orch, getRocketChatLogger: () => ({ error }) });
		cancel.rejects(new Error('db down'));
		try {
			await (bridge as any).cancelJob('daily-cleanup', 'app-id');
		} finally {
			cancel.resolves(1);
		}

		expect(error.calledOnce).to.be.equal(true);
	});
});
