// import { useState, useRef, useEffect } from 'react'
// import { Plus, Settings, Trash2, Send, Loader, FileText, TestTube, ChevronRight } from 'lucide-react'
// import { useStore, type Session, type TCRecord } from '../store/session'
// import { generatePRD, regeneratePRD, approvePRD, generateTests, approveTest, rejectTest, regenerateTest } from '../api/client'
// import ChatMessage from '../components/chat/ChatMessage'
// import Markdown from '../components/prd/Markdown'
// import ConfigModal from '../components/ConfigModal'
// import s from './Workspace.module.css'

// type RightTab = 'prd' | 'testcases'

// export default function Workspace() {
//   const { sessions, activeSessionId, config, configOpen, setConfigOpen,
//     createSession, setActiveSession, deleteSession,
//     addMessage, updateSession, addPRDVersion, updateTC, getActiveSession } = useStore()

//   const [input, setInput] = useState('')
//   const [loading, setLoading] = useState(false)
//   const [loadingMsg, setLoadingMsg] = useState('')
//   const [rightTab, setRightTab] = useState<RightTab>('prd')
//   const chatEndRef = useRef<HTMLDivElement>(null)
//   const session = getActiveSession()

//   useEffect(() => {
//     chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
//   }, [session?.messages.length, loading])

//   const currentPRD = session?.prdVersions.at(-1)

//   const handleSend = async () => {
//     if (!input.trim() || loading) return
//     const text = input.trim()
//     setInput('')

//     // New session if none active
//     let sess: Session
//     if (!session) {
//       sess = createSession(text)
//       await doGeneratePRD(sess, text)
//     } else if (session.stage === 'idle') {
//       addMessage(session.id, { role: 'user', content: text, type: 'text' })
//       await doGeneratePRD(session, text)
//     } else {
//       // Treat as feedback for PRD regeneration
//       addMessage(session.id, { role: 'user', content: text, type: 'text' })
//       if (session.currentPrdId) {
//         await doRegenPRD(session, text, session.currentPrdId)
//       }
//     }
//   }

//   const doGeneratePRD = async (sess: Session, story: string) => {
//     setLoading(true)
//     setLoadingMsg('Generating PRD…')
//     addMessage(sess.id, { role: 'user', content: story, type: 'text' })
//     try {
//       const prd = await generatePRD(story, config)
//       addPRDVersion(sess.id, {
//         prdId: prd.id,
//         content: prd.content,
//         label: 'PRD v1',
//         createdAt: prd.created_at,
//       })
//       updateSession(sess.id, { stage: 'prd_generated', currentPrdId: prd.id })
//       addMessage(sess.id, {
//         role: 'assistant',
//         content: 'PRD has been generated. Review it, give feedback, or approve to proceed to test case generation.',
//         type: 'prd_ready',
//         prdId: prd.id,
//         prdVersion: 1,
//       })
//       setRightTab('prd')
//     } catch (e: any) {
//       addMessage(sess.id, { role: 'assistant', content: `Error: ${e.message}`, type: 'text' })
//     } finally {
//       setLoading(false)
//       setLoadingMsg('')
//     }
//   }

//   const doRegenPRD = async (sess: Session, feedback: string, prdId: number) => {
//     setLoading(true)
//     setLoadingMsg('Regenerating PRD with your feedback…')
//     try {
//       const story = sess.userStory || sess.messages.find(m => m.role === 'user')?.content || ''
//       const promptWithFeedback = `${story}\n\nUser feedback: ${feedback}`
//       const prd = await regeneratePRD(prdId, promptWithFeedback, config)
//       const version = sess.prdVersions.length + 1
//       addPRDVersion(sess.id, {
//         prdId: prd.id,
//         content: prd.content,
//         label: `PRD v${version}`,
//         createdAt: prd.created_at,
//       })
//       updateSession(sess.id, { currentPrdId: prd.id })
//       addMessage(sess.id, {
//         role: 'assistant',
//         content: `PRD updated to v${version} based on your feedback.`,
//         type: 'prd_updated',
//         prdId: prd.id,
//         prdVersion: version,
//       })
//       setRightTab('prd')
//     } catch (e: any) {
//       addMessage(sess.id, { role: 'assistant', content: `Error: ${e.message}`, type: 'text' })
//     } finally {
//       setLoading(false)
//       setLoadingMsg('')
//     }
//   }

//   const handleApprovePRD = async () => {
//     if (!session?.currentPrdId) return
//     setLoading(true)
//     setLoadingMsg('Approving PRD…')
//     try {
//       await approvePRD(session.currentPrdId)
//       updateSession(session.id, { stage: 'prd_approved' })
//       addMessage(session.id, {
//         role: 'assistant',
//         content: 'PRD approved! You can now generate test cases.',
//         type: 'status',
//       })
//     } catch (e: any) {
//       addMessage(session.id, { role: 'assistant', content: `Error: ${e.message}`, type: 'text' })
//     } finally {
//       setLoading(false)
//       setLoadingMsg('')
//     }
//   }

//   const handleGenerateTests = async () => {
//     if (!session?.currentPrdId) return
//     setLoading(true)
//     setLoadingMsg('Generating scenarios → risks → test cases (this takes 1-2 min)…')
//     try {
//       // Auto-approve PRD if not already
//       if (session.stage !== 'prd_approved') {
//         await approvePRD(session.currentPrdId)
//         updateSession(session.id, { stage: 'prd_approved' })
//       }
//       const tcs = await generateTests(session.currentPrdId, config)
//       const mapped: TCRecord[] = tcs.map((t: any) => ({
//         id: t.id,
//         title: t.title,
//         priority: t.priority,
//         category: t.scenario_category,
//         status: t.status,
//         tags: t.tags,
//         preconditions: t.preconditions,
//         gherkin_steps: t.gherkin_steps,
//         risks: t.risks,
//         limitations: t.limitations,
//         scenario_id: t.scenario_id,
//         scenario_title: t.scenario_title,
//         scenario_category: t.scenario_category,
//       }))
//       updateSession(session.id, { stage: 'tests_generated', testCases: mapped })
//       addMessage(session.id, {
//         role: 'assistant',
//         content: `${mapped.length} test cases generated. Review each one below.`,
//         type: 'tests_ready',
//         tcIds: mapped.map(t => t.id),
//       })
//       setRightTab('testcases')
//     } catch (e: any) {
//       addMessage(session.id, { role: 'assistant', content: `Error: ${e.message}`, type: 'text' })
//     } finally {
//       setLoading(false)
//       setLoadingMsg('')
//     }
//   }

//   const handleApproveTC = async (id: number) => {
//     if (!session) return
//     await approveTest(id)
//     const tc = session.testCases.find(t => t.id === id)
//     if (tc) updateTC(session.id, { ...tc, status: 'approved' })
//   }

//   const handleRejectTC = async (id: number, reason: string) => {
//     if (!session) return
//     await rejectTest(id, reason)
//     const tc = session.testCases.find(t => t.id === id)
//     if (tc) updateTC(session.id, { ...tc, status: 'rejected' })
//   }

//   const handleRegenTC = async (tc: TCRecord) => {
//     if (!session || !currentPRD) return
//     const updated = await regenerateTest(tc.id, config, tc, currentPRD.content)
//     updateTC(session.id, {
//       ...tc,
//       title: updated.title,
//       priority: updated.priority,
//       tags: updated.tags,
//       preconditions: updated.preconditions,
//       gherkin_steps: updated.gherkin_steps,
//       status: 'pending',
//     })
//   }

//   const handleRegenFromFeedback = async (feedback?: string) => {
//     if (!session?.currentPrdId || !feedback) return
//     addMessage(session.id, { role: 'user', content: feedback, type: 'text' })
//     await doRegenPRD(session, feedback, session.currentPrdId)
//   }

//   const handleNewSession = () => {
//     const sess = createSession('')
//     // Don't auto-add messages — wait for user input
//     updateSession(sess.id, { stage: 'idle' })
//   }

//   const formatDate = (iso: string) => {
//     const d = new Date(iso)
//     const now = new Date()
//     const diff = now.getTime() - d.getTime()
//     if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
//     if (diff < 172800000) return 'Yesterday'
//     return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
//   }

//   return (
//     <div className={s.app}>
//       {/* ── LEFT: Sessions sidebar ── */}
//       <aside className={s.sidebar}>
//         <div className={s.sidebarTop}>
//           <span className={s.logo}>⚡ QA Pipeline</span>
//           <button className={s.iconBtn} onClick={() => setConfigOpen(true)} title="Settings">
//             <Settings size={15} />
//           </button>
//         </div>

//         <button className={s.newBtn} onClick={handleNewSession}>
//           <Plus size={14} /> New session
//         </button>

//         <div className={s.sessionList}>
//           {sessions.map(sess => (
//             <div
//               key={sess.id}
//               className={`${s.sessionItem} ${sess.id === activeSessionId ? s.active : ''}`}
//               onClick={() => setActiveSession(sess.id)}
//             >
//               <div className={s.sessionInfo}>
//                 <div className={s.sessionTitle}>{sess.title || 'New session'}</div>
//                 <div className={s.sessionMeta}>
//                   {sess.stage === 'tests_generated' && `${sess.testCases.length} TCs`}
//                   {sess.stage === 'prd_approved' && 'PRD approved'}
//                   {sess.stage === 'prd_generated' && 'PRD draft'}
//                   {sess.stage === 'idle' && 'New'}
//                   {' · '}{formatDate(sess.updatedAt)}
//                 </div>
//               </div>
//               <button
//                 className={s.deleteBtn}
//                 onClick={e => { e.stopPropagation(); deleteSession(sess.id) }}
//               >
//                 <Trash2 size={12} />
//               </button>
//             </div>
//           ))}
//         </div>
//       </aside>

//       {/* ── CENTER: Chat ── */}
//       <main className={s.chat}>
//         {!session ? (
//           <div className={s.empty}>
//             <div className={s.emptyIcon}>⚡</div>
//             <h2>QA Pipeline</h2>
//             <p>Start by writing a user story</p>
//             <div className={s.examples}>
//               {[
//                 'As a user, I want to reset my password so I can regain access.',
//                 'As an admin, I want to invite team members so they can join the workspace.',
//                 'As a buyer, I want to checkout with saved payment method to complete purchase faster.',
//               ].map(ex => (
//                 <button key={ex} className={s.exampleBtn} onClick={() => setInput(ex)}>
//                   <ChevronRight size={12} />{ex}
//                 </button>
//               ))}
//             </div>
//           </div>
//         ) : (
//           <>
//             <div className={s.chatTopbar}>
//               <div>
//                 <div className={s.chatTitle}>{session.title || 'New session'}</div>
//                 <div className={s.chatMeta}>
//                   {session.stage === 'idle' && 'Write a user story to get started'}
//                   {session.stage === 'prd_generated' && 'PRD generated — review or approve'}
//                   {session.stage === 'prd_approved' && 'PRD approved — generate test cases'}
//                   {session.stage === 'tests_generated' && `${session.testCases.length} test cases generated`}
//                 </div>
//               </div>
//               <div className={s.stagePills}>
//                 <span className={`${s.pill} ${session.stage !== 'idle' ? s.done : ''}`}>PRD</span>
//                 <span className={s.pillArrow}>›</span>
//                 <span className={`${s.pill} ${session.stage === 'tests_generated' ? s.done : ''}`}>Tests</span>
//               </div>
//             </div>

//             <div className={s.messages}>
//               {session.messages.map(msg => (
//                 <ChatMessage
//                   key={msg.id}
//                   msg={msg}
//                   onApprovePRD={handleApprovePRD}
//                   onRegenPRD={handleRegenFromFeedback}
//                   onGenerateTests={handleGenerateTests}
//                   onApproveTC={handleApproveTC}
//                   onRejectTC={handleRejectTC}
//                   onRegenTC={handleRegenTC}
//                   testCases={msg.type === 'tests_ready' ? session.testCases : undefined}
//                   prdContent={currentPRD?.content}
//                 />
//               ))}

//               {loading && (
//                 <div className={s.loadingRow}>
//                   <div className={s.aiAvatar}>AI</div>
//                   <div className={s.loadingBubble}>
//                     <Loader size={13} className={s.spin} />
//                     <span>{loadingMsg}</span>
//                   </div>
//                 </div>
//               )}
//               <div ref={chatEndRef} />
//             </div>

//             <div className={s.inputArea}>
//               <div className={s.inputWrap}>
//                 <textarea
//                   className={s.input}
//                   placeholder={
//                     session.stage === 'idle'
//                       ? 'Write your user story…'
//                       : 'Give feedback, approve, or ask to regenerate…'
//                   }
//                   value={input}
//                   onChange={e => setInput(e.target.value)}
//                   onKeyDown={e => {
//                     if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
//                   }}
//                   rows={2}
//                   disabled={loading}
//                 />
//                 <button className={s.sendBtn} onClick={handleSend} disabled={loading || !input.trim()}>
//                   <Send size={14} />
//                 </button>
//               </div>
//               <div className={s.inputHint}>Enter to send · Shift+Enter for new line</div>
//             </div>
//           </>
//         )}
//       </main>

//       {/* ── RIGHT: Artifacts panel ── */}
//       {session && (
//         <aside className={s.artifacts}>
//           <div className={s.artifactsTop}>
//             <div className={s.artifactsTabs}>
//               <button className={`${s.artTab} ${rightTab === 'prd' ? s.artTabActive : ''}`} onClick={() => setRightTab('prd')}>
//                 <FileText size={13} /> PRD
//               </button>
//               <button className={`${s.artTab} ${rightTab === 'testcases' ? s.artTabActive : ''}`} onClick={() => setRightTab('testcases')}>
//                 <TestTube size={13} /> Test Cases
//                 {session.testCases.length > 0 && <span className={s.countBadge}>{session.testCases.length}</span>}
//               </button>
//             </div>
//           </div>

//           <div className={s.artifactsBody}>
//             {/* PRD tab */}
//             {rightTab === 'prd' && (
//               <div className={s.prdPanel}>
//                 {session.prdVersions.length === 0 ? (
//                   <div className={s.panelEmpty}>No PRD yet. Write a user story to generate one.</div>
//                 ) : (
//                   <>
//                     <div className={s.prdMeta}>
//                       <span className={s.prdVersion}>{currentPRD?.label ?? 'PRD'}</span>
//                       <span className={`${s.stageTag} ${s[session.stage]}`}>
//                         {session.stage === 'prd_approved' ? 'Approved' :
//                          session.stage === 'tests_generated' ? 'Approved' : 'Draft'}
//                       </span>
//                     </div>
//                     <div className={s.prdContent}>
//                       <Markdown content={currentPRD?.content ?? ''} />
//                     </div>
//                     {session.prdVersions.length > 1 && (
//                       <div className={s.versions}>
//                         <div className={s.versionsLabel}>All versions</div>
//                         {[...session.prdVersions].reverse().map(v => (
//                           <div key={v.version} className={s.versionItem}>
//                             <span>{v.label}</span>
//                             <span className={s.versionDate}>{formatDate(v.createdAt)}</span>
//                           </div>
//                         ))}
//                       </div>
//                     )}
//                   </>
//                 )}
//               </div>
//             )}

//             {/* Test cases tab */}
//             {rightTab === 'testcases' && (
//               <div className={s.tcPanel}>
//                 {session.testCases.length === 0 ? (
//                   <div className={s.panelEmpty}>No test cases yet. Approve PRD and generate tests.</div>
//                 ) : (
//                   <>
//                     <div className={s.tcSummary}>
//                       <div className={s.tcStat}><span style={{color:'var(--green)'}}>{session.testCases.filter(t=>t.status==='approved').length}</span> Approved</div>
//                       <div className={s.tcStat}><span style={{color:'var(--amber)'}}>{session.testCases.filter(t=>t.status==='pending').length}</span> Pending</div>
//                       <div className={s.tcStat}><span style={{color:'var(--red)'}}>{session.testCases.filter(t=>t.status==='rejected').length}</span> Rejected</div>
//                     </div>
//                     {session.testCases.map(tc => (
//                       <div key={tc.id} className={`${s.tcRow} ${s[tc.status]}`}>
//                         <div className={s.tcRowLeft}>
//                           <span className={s.tcPri} data-p={tc.priority}>{tc.priority}</span>
//                           <span className={s.tcRowTitle}>{tc.title}</span>
//                         </div>
//                         <span className={`${s.tcDot} ${s[tc.status]}`} />
//                       </div>
//                     ))}
//                   </>
//                 )}
//               </div>
//             )}
//           </div>
//         </aside>
//       )}

//       {configOpen && <ConfigModal />}
//     </div>
//   )
// }