import { useCallback, useState, useRef, useEffect } from 'react';
import { FolderOpen, Plus, X, ChevronDown, GripVertical } from 'lucide-react';
import { useProjectStore } from '../../stores/project-store';
import { cn } from '../../../shared/utils';

export function ProjectTabBar() {
  const projects = useProjectStore((s) => s.projects);
  const openProjectIds = useProjectStore((s) => s.openProjectIds);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const tabOrder = useProjectStore((s) => s.tabOrder);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const closeProjectTab = useProjectStore((s) => s.closeProjectTab);
  const openProjectTab = useProjectStore((s) => s.openProjectTab);
  const addProject = useProjectStore((s) => s.addProject);
  const removeProject = useProjectStore((s) => s.removeProject);
  const reorderTabs = useProjectStore((s) => s.reorderTabs);

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  // Get ordered open projects
  const openProjects = tabOrder
    .filter((id) => openProjectIds.includes(id))
    .map((id) => projects.find((p) => p.id === id))
    .filter(Boolean) as typeof projects;

  // Add any open projects not in tabOrder (fallback)
  openProjectIds.forEach((id) => {
    if (!tabOrder.includes(id)) {
      const p = projects.find((proj) => proj.id === id);
      if (p) openProjects.push(p);
    }
  });

  // Closed projects (known but not open as tabs)
  const closedProjects = projects.filter((p) => !openProjectIds.includes(p.id));

  const handleAddProject = useCallback(async () => {
    setShowDropdown(false);
    await addProject();
  }, [addProject]);

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      closeProjectTab(projectId);
    },
    [closeProjectTab]
  );

  const handleReopenProject = useCallback(
    (projectId: string) => {
      setShowDropdown(false);
      openProjectTab(projectId);
    },
    [openProjectTab]
  );

  const handleRemoveProject = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      removeProject(projectId);
    },
    [removeProject]
  );

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      reorderTabs(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
  }, [dragIndex, reorderTabs]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  return (
    <div className="h-9 bg-[var(--bg-primary)] border-b border-[var(--border)] flex items-center px-1 gap-0.5 overflow-x-auto shrink-0">
      {openProjects.map((project, index) => (
        <div
          key={project.id}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          onClick={() => setActiveProject(project.id)}
          title={index < 9 ? `${project.name}  (Ctrl+${index + 1})` : project.name}
          className={cn(
            'group flex items-center gap-1 px-2 h-7 rounded-md text-xs transition-all min-w-0 shrink-0 cursor-pointer',
            'hover:bg-[var(--bg-tertiary)]',
            activeProjectId === project.id
              ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)]'
              : 'text-[var(--text-muted)]',
            dragIndex === index && 'opacity-40',
            dropIndex === index && dragIndex !== null && dragIndex !== index && 'border-l-2 border-l-[var(--accent)]'
          )}
        >
          <GripVertical className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing" />
          <FolderOpen className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[140px]">{project.name}</span>
          {index < 9 && (
            <span className="text-[9px] text-[var(--text-muted)] opacity-0 group-hover:opacity-60 shrink-0 ml-0.5">{index + 1}</span>
          )}
          <button
            className="w-4 h-4 shrink-0 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-[var(--error)]/20 hover:text-[var(--error)] text-[var(--text-muted)] transition-all"
            onClick={(e) => handleCloseTab(e, project.id)}
            title="Close project tab"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      {/* Add / Reopen dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => closedProjects.length > 0 ? setShowDropdown(!showDropdown) : handleAddProject()}
          className={cn(
            'h-7 rounded-md flex items-center justify-center transition-all shrink-0 gap-0.5 px-1.5',
            'hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
          )}
          title="Add Project Folder"
        >
          <Plus className="w-3.5 h-3.5" />
          {closedProjects.length > 0 && <ChevronDown className="w-3 h-3" />}
        </button>

        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
            {closedProjects.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border)]">
                  Recent Projects
                </div>
                {closedProjects.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-tertiary)] cursor-pointer"
                    onClick={() => handleReopenProject(p.id)}
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-[var(--text-primary)] truncate">{p.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">{p.path}</div>
                    </div>
                    <button
                      className="w-4 h-4 shrink-0 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-[var(--error)]/20 hover:text-[var(--error)] text-[var(--text-muted)] transition-all"
                      onClick={(e) => handleRemoveProject(e, p.id)}
                      title="Remove project"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="border-t border-[var(--border)]" />
              </>
            )}
            <button
              onClick={handleAddProject}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Open New Folder...</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
