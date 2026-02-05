import{c as p,p as M}from"./state-72d44OIA.js";import{n as N}from"./index-CCWWoMiH.js";const D=()=>`ai-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,I=p()(M((n,C)=>({conversations:[],activeConversationId:null,selectedMode:"standard",isLoading:!1,initialMessage:null,documentContext:null,redlineDocuments:{doc1:null,doc2:null},setSelectedMode:e=>{n({selectedMode:e})},setDocumentContext:e=>{n({documentContext:e})},setInitialMessage:e=>{n({initialMessage:e})},setRedlineDocument:(e,t)=>{n(s=>({redlineDocuments:{...s.redlineDocuments,[e]:t}}))},clearDocumentContext:()=>{n({documentContext:null,redlineDocuments:{doc1:null,doc2:null}})},createConversation:(e,t)=>{const s={standard:"Chat",document:"Document Analysis",redline:"Redline"},a={id:D(),title:e?`${s[e]} - New`:"New Conversation",messages:[],model:"gpt-4",createdBy:"user-1",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return n(o=>({conversations:[a,...o.conversations],activeConversationId:a.id,selectedMode:e||o.selectedMode})),a},setActiveConversation:e=>{n({activeConversationId:e})},addMessage:(e,t)=>{const s={...t,id:D(),timestamp:new Date().toISOString()};n(a=>({conversations:a.conversations.map(o=>{if(o.id===e){const l=[...o.messages,s],i=(o.title.includes("- New")||o.title==="New Conversation")&&t.role==="user"?t.content.slice(0,40)+(t.content.length>40?"...":""):o.title;return{...o,title:i,messages:l,updatedAt:new Date().toISOString()}}return o})}))},deleteConversation:e=>{n(t=>({conversations:t.conversations.filter(s=>s.id!==e),activeConversationId:t.activeConversationId===e?null:t.activeConversationId}))},generateResponse:async(e,t,s)=>{const{addMessage:a,conversations:o,selectedMode:l,documentContext:i,redlineDocuments:r}=C();a(e,{role:"user",content:t}),n({isLoading:!0});try{const c=o.find(u=>u.id===e),g=(c==null?void 0:c.messages.map(u=>({role:u.role,content:u.content})))||[];let d=t,m;s?d=`${s}

User's question: ${t}`:l==="document"&&i?i.imageData?(m=i.imageData,d=`[IMAGE ANALYSIS REQUEST]
The user has uploaded an image file: ${i.name}

Please analyze this image and respond to the user's question. You can:
- Read and extract any text visible in the image (OCR)
- Describe the contents of the image
- Answer questions about what you see
- Identify document types, forms, or structured content

User's question about this image: ${t}`):d=`[DOCUMENT CONTEXT - The user has uploaded a document for analysis]
Document Name: ${i.name}
Document Type: ${i.type||"Unknown"}

--- DOCUMENT CONTENT ---
${i.content}
--- END DOCUMENT ---

User's question about this document: ${t}`:l==="redline"&&r.doc1&&r.doc2&&(d=`[REDLINE COMPARISON REQUEST - Compare these two documents and identify changes]

--- DOCUMENT 1: ${r.doc1.name} ---
${r.doc1.content}
--- END DOCUMENT 1 ---

--- DOCUMENT 2: ${r.doc2.name} ---
${r.doc2.content}
--- END DOCUMENT 2 ---

User's request: ${t}`);const v=await N.chat(d,"ai-assistant",{imageData:m},g);a(e,{role:"assistant",content:v.response})}catch(c){console.error("AI API error:",c),a(e,{role:"assistant",content:"Sorry, I encountered an error. Please try again."})}n({isLoading:!1})}}),{name:"apex-ai",partialize:n=>({conversations:n.conversations,selectedMode:n.selectedMode})}));export{I as u};
