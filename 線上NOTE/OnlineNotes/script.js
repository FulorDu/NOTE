document.addEventListener('DOMContentLoaded', () => {
    const tabList = document.getElementById('tab-list');
    const addBtn = document.getElementById('add-btn');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const noteTitle = document.getElementById('note-title');
    const noteContent = document.getElementById('note-content');
    const saveStatus = document.getElementById('save-status');
    const fontDecreaseBtn = document.getElementById('font-decrease');
    const fontIncreaseBtn = document.getElementById('font-increase');
    const fontSizeDisplay = document.getElementById('font-size-display');

    let notes = JSON.parse(localStorage.getItem('sleekNotes')) || [];
    let currentFontSize = parseInt(localStorage.getItem('sleekNotesFontSize')) || 18;
    let currentNoteId = null;
    let saveTimeout = null;
    let sortableInstances = [];

    // Migrate old notes
    notes.forEach(note => {
        if (!note.type) note.type = 'note';
    });
    saveNotesToLocal();

    // Initialize
    applyFontSize();
    if (notes.length === 0) {
        createNewNote();
    } else {
        renderTabs();
        const firstNote = getFirstNote(notes);
        if (firstNote) {
            selectNote(firstNote.id);
        } else {
            clearEditor();
        }
    }

    // Event Listeners
    addBtn.addEventListener('click', createNewNote);
    if (addFolderBtn) addFolderBtn.addEventListener('click', createNewFolder);

    fontDecreaseBtn.addEventListener('click', () => {
        if (currentFontSize > 12) {
            currentFontSize -= 2;
            applyFontSize();
            saveFontSize();
        }
    });

    fontIncreaseBtn.addEventListener('click', () => {
        if (currentFontSize < 36) {
            currentFontSize += 2;
            applyFontSize();
            saveFontSize();
        }
    });

    noteTitle.addEventListener('input', () => {
        triggerSave();
        updateTabTitle(currentNoteId, noteTitle.value);
    });

    noteContent.addEventListener('input', triggerSave);

    function createNewNote() {
        const newNote = {
            id: Date.now().toString(),
            type: 'note',
            title: '',
            content: '',
            createdAt: new Date().toISOString()
        };
        notes.unshift(newNote); // Add to beginning
        saveNotesToLocal();
        renderTabs();
        selectNote(newNote.id);
        noteTitle.focus();
    }

    function createNewFolder() {
        const newFolder = {
            id: Date.now().toString(),
            type: 'folder',
            title: '新資料夾',
            isExpanded: true,
            children: [],
            createdAt: new Date().toISOString()
        };
        notes.unshift(newFolder);
        saveNotesToLocal();
        renderTabs();
    }

    function renderTabs() {
        tabList.innerHTML = '';
        notes.forEach(item => {
            tabList.appendChild(createTabElement(item, 'root'));
        });
        initSortables();
    }

    function createTabElement(item, parentId) {
        const li = document.createElement('li');
        li.dataset.id = item.id;
        li.dataset.type = item.type;
        
        if (item.type === 'folder') {
            li.className = 'tab-item folder';
            li.innerHTML = `
                <div class="folder-header">
                    <i class="fa-solid ${item.isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} toggle-icon"></i>
                    <i class="fa-solid fa-folder folder-icon"></i>
                    <span class="tab-title" contenteditable="true" spellcheck="false">${item.title || '新資料夾'}</span>
                    <button class="add-note-btn" title="移入已有筆記"><i class="fa-solid fa-file-import"></i></button>
                    <button class="delete-btn" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
                </div>
                <ul class="folder-contents ${item.isExpanded ? '' : 'collapsed'}" data-folder-id="${item.id}">
                </ul>
            `;
            
            li.querySelector('.folder-header').addEventListener('click', (e) => {
                if (!e.target.closest('.delete-btn') && !e.target.closest('.add-note-btn') && !e.target.closest('.tab-title')) {
                    e.stopPropagation();
                    item.isExpanded = !item.isExpanded;
                    saveNotesToLocal();
                    renderTabs();
                }
            });

            li.querySelector('.add-note-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openMoveModal(item.id);
            });
            
            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if(confirm('確定要刪除這個資料夾及其所有內容嗎？')) {
                    deleteItem(item.id);
                }
            });

            const titleEl = li.querySelector('.tab-title');
            titleEl.addEventListener('blur', (e) => {
               item.title = e.target.textContent;
               saveNotesToLocal();
            });
            titleEl.addEventListener('keydown', (e) => {
               if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
            });

            // Prevent drag when clicking editable title
            titleEl.addEventListener('mousedown', e => e.stopPropagation());

            const ul = li.querySelector('.folder-contents');
            if (item.children) {
                item.children.forEach(child => {
                    ul.appendChild(createTabElement(child, item.id));
                });
            }
            return li;
        } else {
            li.className = `tab-item note ${item.id === currentNoteId ? 'active' : ''}`;
            li.innerHTML = `
                <i class="fa-solid fa-file-lines note-icon"></i>
                <span class="tab-title">${item.title || '未命名筆記'}</span>
                <button class="delete-btn" title="刪除"><i class="fa-solid fa-trash-can"></i></button>
            `;
            
            li.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-btn')) {
                    selectNote(item.id);
                }
            });

            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteItem(item.id);
            });
            return li;
        }
    }

    function initSortables() {
        sortableInstances.forEach(sq => sq.destroy());
        sortableInstances = [];

        const lists = [tabList, ...document.querySelectorAll('.folder-contents')];
        lists.forEach(list => {
            sortableInstances.push(new Sortable(list, {
                group: 'notes',
                animation: 150,
                fallbackOnBody: true,
                swapThreshold: 0.65,
                ghostClass: 'sortable-ghost',
                filter: '.tab-title', // Prevent dragging when clicking on title
                preventOnFilter: false,
                onMove: function(evt) {
                   // Prevent dragging folder into folder
                   if (evt.dragged.dataset.type === 'folder' && evt.to.classList.contains('folder-contents')) {
                       return false;
                   }
                },
                onEnd: function (evt) {
                    const itemEl = evt.item; 
                    const oldList = evt.from;
                    const newList = evt.to;
                    
                    const oldId = oldList.id === 'tab-list' ? 'root' : oldList.dataset.folderId;
                    const newId = newList.id === 'tab-list' ? 'root' : newList.dataset.folderId;
                    
                    if (oldList === newList && evt.oldIndex === evt.newIndex) return;

                    const movedItem = removeItemFromState(oldId, evt.oldIndex);
                    if (movedItem) {
                        insertItemIntoState(newId, evt.newIndex, movedItem);
                        saveNotesToLocal();
                        setTimeout(() => renderTabs(), 0);
                    }
                }
            }));
        });
    }

    function findListArray(folderId) {
        if (folderId === 'root' || !folderId) return notes;
        const folder = findItemRecursively(notes, folderId);
        return folder ? folder.children : null;
    }

    function findItemRecursively(arr, id) {
        for (let item of arr) {
            if (item.id === id) return item;
            if (item.type === 'folder' && item.children) {
                const found = findItemRecursively(item.children, id);
                if (found) return found;
            }
        }
        return null;
    }
    
    function getFirstNote(arr) {
        for (let item of arr) {
            if (item.type === 'note') return item;
            if (item.type === 'folder' && item.children && item.children.length > 0) {
                const found = getFirstNote(item.children);
                if (found) return found;
            }
        }
        return null;
    }

    function removeItemFromState(folderId, index) {
        const list = findListArray(folderId);
        if (list && list.length > index) {
            return list.splice(index, 1)[0];
        }
        return null;
    }

    function insertItemIntoState(folderId, index, item) {
        const list = findListArray(folderId);
        if (list) {
            list.splice(index, 0, item);
        }
    }

    function selectNote(id) {
        const note = findItemRecursively(notes, id);
        if (note && note.type === 'note') {
            currentNoteId = id;
            noteTitle.value = note.title;
            noteContent.value = note.content;
            noteTitle.disabled = false;
            noteContent.disabled = false;
            saveStatus.textContent = '已儲存';
            saveStatus.className = 'save-status saved';
            
            // update UI
            document.querySelectorAll('.tab-item.note').forEach(el => {
                if (el.dataset.id === id) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
        }
    }

    function deleteItem(id) {
        function removeRec(arr) {
            const index = arr.findIndex(n => n.id === id);
            if (index > -1) {
                arr.splice(index, 1);
                return true;
            }
            for (let item of arr) {
                if (item.type === 'folder' && item.children) {
                    if (removeRec(item.children)) return true;
                }
            }
            return false;
        }
        
        removeRec(notes);
        saveNotesToLocal();
        
        const currentStillExists = findItemRecursively(notes, currentNoteId);
        if (!currentStillExists) {
            const nextNote = getFirstNote(notes);
            if (nextNote) {
                selectNote(nextNote.id);
            } else {
                clearEditor();
            }
        }
        renderTabs();
    }

    function clearEditor() {
        currentNoteId = null;
        noteTitle.value = '';
        noteContent.value = '';
        noteTitle.disabled = true;
        noteContent.disabled = true;
        saveStatus.textContent = '';
        saveStatus.className = 'save-status';
    }

    function triggerSave() {
        if (!currentNoteId) return;
        saveStatus.textContent = '儲存中...';
        saveStatus.className = 'save-status saving';
        
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const note = findItemRecursively(notes, currentNoteId);
            if (note) {
                note.title = noteTitle.value;
                note.content = noteContent.value;
                saveNotesToLocal();
                saveStatus.textContent = '已儲存';
                saveStatus.className = 'save-status saved';
                
                // update tab title without full re-render
                const tabTitle = document.querySelector(`.tab-item.note[data-id="${currentNoteId}"] .tab-title`);
                if (tabTitle) tabTitle.textContent = note.title || '未命名筆記';
            }
        }, 500); // 500ms debounce
    }

    function updateTabTitle(id, newTitle) {
        const tabEl = document.querySelector(`.tab-item.note[data-id="${id}"] .tab-title`);
        if (tabEl) {
            tabEl.textContent = newTitle || '未命名筆記';
        }
    }

    function saveNotesToLocal() {
        localStorage.setItem('sleekNotes', JSON.stringify(notes));
    }

    function applyFontSize() {
        noteContent.style.fontSize = `${currentFontSize}px`;
        fontSizeDisplay.textContent = `${currentFontSize}px`;
    }

    function saveFontSize() {
        localStorage.setItem('sleekNotesFontSize', currentFontSize.toString());
    }

    const moveModal = document.getElementById('move-modal');
    const moveSelect = document.getElementById('move-note-select');
    const moveCancelBtn = document.getElementById('move-cancel-btn');
    const moveConfirmBtn = document.getElementById('move-confirm-btn');
    let targetFolderIdForMove = null;

    if (moveCancelBtn) {
        moveCancelBtn.addEventListener('click', () => {
            moveModal.classList.add('hidden');
            targetFolderIdForMove = null;
        });
    }

    if (moveConfirmBtn) {
        moveConfirmBtn.addEventListener('click', () => {
            const selectedNoteId = moveSelect.value;
            if (selectedNoteId && targetFolderIdForMove) {
                const note = findItemRecursively(notes, selectedNoteId);
                if (note) {
                    removeItemFromStateById(selectedNoteId);
                    insertItemIntoState(targetFolderIdForMove, 0, note);
                    saveNotesToLocal();
                    renderTabs();
                    selectNote(selectedNoteId); // Automatically open the note so content is readable
                }
            }
            moveModal.classList.add('hidden');
            targetFolderIdForMove = null;
        });
    }

    function openMoveModal(folderId) {
        targetFolderIdForMove = folderId;
        moveSelect.innerHTML = '';
        const allNotes = getAllNotesFlat(notes);
        const folder = findItemRecursively(notes, folderId);
        const existingChildIds = folder.children ? folder.children.map(c => c.id) : [];
        const availableNotes = allNotes.filter(n => !existingChildIds.includes(n.id));
        
        if (availableNotes.length === 0) {
            moveSelect.innerHTML = '<option value="">(無可用的筆記)</option>';
            moveConfirmBtn.disabled = true;
        } else {
            availableNotes.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n.id;
                opt.textContent = n.title || '未命名筆記';
                moveSelect.appendChild(opt);
            });
            moveConfirmBtn.disabled = false;
        }
        moveModal.classList.remove('hidden');
    }

    function getAllNotesFlat(arr) {
        let result = [];
        for(let item of arr) {
            if (item.type === 'note') result.push(item);
            if (item.type === 'folder' && item.children) {
                result = result.concat(getAllNotesFlat(item.children));
            }
        }
        return result;
    }

    function removeItemFromStateById(id) {
        function removeRec(arr) {
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].id === id) {
                    return arr.splice(i, 1)[0];
                }
                if (arr[i].type === 'folder' && arr[i].children) {
                    const removed = removeRec(arr[i].children);
                    if (removed) return removed;
                }
            }
            return null;
        }
        return removeRec(notes);
    }
});
