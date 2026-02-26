import { dialog, type IpcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import * as ProjectStore from '../project/project-store';

export function registerProjectHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, async () => {
    return { success: true, data: ProjectStore.getProjects() };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_ADD, async (_event, projectPath: string, name?: string) => {
    const project = ProjectStore.addProject(projectPath, name);
    return { success: true, data: project };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_REMOVE, async (_event, projectId: string) => {
    const removed = ProjectStore.removeProject(projectId);
    return { success: removed };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, async (_event, projectId: string, updates: { name?: string }) => {
    const project = ProjectStore.updateProject(projectId, updates);
    return project ? { success: true, data: project } : { success: false, error: 'Project not found' };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_SELECT_FOLDER, async () => {
    const win = getWindow();
    if (!win) return { success: false, error: 'No window' };

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Project Folder',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const projectPath = result.filePaths[0];
    const project = ProjectStore.addProject(projectPath);
    return { success: true, data: project };
  });

  ipcMain.handle(IPC_CHANNELS.TAB_STATE_GET, async () => {
    return { success: true, data: ProjectStore.getTabState() };
  });

  ipcMain.handle(IPC_CHANNELS.TAB_STATE_SAVE, async (_event, tabState: any) => {
    ProjectStore.saveTabState(tabState);
    return { success: true };
  });
}
