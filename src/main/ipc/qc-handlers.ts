import type { BrowserWindow, IpcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { IPC_CHANNELS } from '../../shared/constants';
import type { InsightsModel, QCTask } from '../../shared/types';
import { generateTestCases, runAllTests, runTestCase, abortQC } from '../qc/qc-executor';
import { getSession, saveSession } from '../insights/session-storage';

export function registerQCHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null,
): void {
  // Generate test cases from task description
  ipcMain.handle(
    IPC_CHANNELS.QC_GENERATE_TESTS,
    async (_event, sessionId: string, title: string, description: string, targetUrl: string, model: InsightsModel) => {
      try {
        const session = await getSession(sessionId);
        if (!session) return { success: false, error: 'Session not found' };

        const testCases = await generateTestCases(sessionId, title, description, targetUrl, model, getWindow);

        const qcTask: QCTask = {
          id: uuidv4(),
          sessionId,
          title,
          description,
          targetUrl,
          testCases,
          status: 'ready',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        session.qcTask = qcTask;
        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        return { success: true, data: qcTask };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to generate tests' };
      }
    },
  );

  // Run all test cases
  ipcMain.handle(
    IPC_CHANNELS.QC_RUN_TESTS,
    async (_event, sessionId: string, model: InsightsModel) => {
      try {
        const session = await getSession(sessionId);
        if (!session?.qcTask) return { success: false, error: 'No QC task found' };

        session.qcTask.status = 'running';
        await saveSession(session);

        const updatedTask = await runAllTests(sessionId, session.qcTask, model, getWindow);

        // Reload session and update
        const freshSession = await getSession(sessionId);
        if (freshSession) {
          freshSession.qcTask = updatedTask;
          freshSession.updatedAt = new Date().toISOString();
          await saveSession(freshSession);
        }

        return { success: true, data: updatedTask };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to run tests' };
      }
    },
  );

  // Run a single test case
  ipcMain.handle(
    IPC_CHANNELS.QC_RUN_SINGLE_TEST,
    async (_event, sessionId: string, testCaseId: string, model: InsightsModel) => {
      try {
        const session = await getSession(sessionId);
        if (!session?.qcTask) return { success: false, error: 'No QC task found' };

        const testCase = session.qcTask.testCases.find((tc) => tc.id === testCaseId);
        if (!testCase) return { success: false, error: 'Test case not found' };

        const result = await runTestCase(
          sessionId,
          session.qcTask.id,
          { ...testCase, status: 'pending', steps: testCase.steps.map((s) => ({ ...s, status: 'pending' as const })) },
          session.qcTask.targetUrl,
          model,
          getWindow,
        );

        // Update session
        const freshSession = await getSession(sessionId);
        if (freshSession?.qcTask) {
          freshSession.qcTask.testCases = freshSession.qcTask.testCases.map((tc) =>
            tc.id === testCaseId ? result : tc,
          );
          freshSession.qcTask.updatedAt = new Date().toISOString();
          await saveSession(freshSession);
        }

        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to run test' };
      }
    },
  );

  // Abort QC execution
  ipcMain.handle(IPC_CHANNELS.QC_ABORT, async (_event, sessionId: string) => {
    abortQC(sessionId);
    return { success: true };
  });
}
