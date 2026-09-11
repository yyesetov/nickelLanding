const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const directions = {
  systems: {name:"Разработка информационных систем", title:"Разработка информационных систем", description:"Проектируем и разрабатываем программные решения под задачи бизнеса. Определяем требования, выстраиваем архитектуру и сопровождаем внедрение. Учитываем нагрузку, безопасность и дальнейшее развитие системы."},
  ai: {name:"Искусственный интеллект", title:"Искусственный интеллект", description:"Внедряем AI там, где он даёт измеримую пользу. Оцениваем готовность данных, выбираем подходящие модели и интегрируем их в процессы компании. Проверяем качество, контролируем доступ к данным и стоимость эксплуатации."},
  automation: {name:"Автоматизация бизнес-процессов", title:"Автоматизация бизнес-процессов", description:"Анализируем работу подразделений, устраняем избыточные этапы и автоматизируем операции. Объединяем информационные системы, настраиваем правила исполнения и контроль сроков. Сохраняем прозрачность процесса для сотрудников и руководителей."},
  consulting: {name:"IT-консалтинг и архитектура", title:"IT-консалтинг и архитектура", description:"Помогаем принимать обоснованные технологические решения. Проводим аудит, выявляем ограничения и проектируем целевую архитектуру. Формируем план изменений с учётом рисков, бюджета и приоритетов бизнеса."}
};
let selected='systems';
try { if(sessionStorage.getItem('nickel-welcomed')) document.body.classList.add('no-welcome'); sessionStorage.setItem('nickel-welcomed','1'); } catch {}
setTimeout(()=>$('.welcome')?.remove(),1900);
$('#year').textContent=new Date().getFullYear();
function selectSolution(key, focus=false){
  if(!directions[key])return;
  selected=key;const d=directions[key];const tabs=$$('[data-solution]');
  tabs.forEach(t=>{const active=t.dataset.solution===key;t.classList.toggle('active',active);t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;});
  const tab=$(`[data-solution="${key}"]`);
  $('#solution-panel').setAttribute('aria-labelledby',tab.id);
  $('.solution-copy h3').textContent=d.title;
  $('.solution-copy>p').textContent=d.description;
  const copy=$('.solution-copy');copy.classList.remove('changing');void copy.offsetWidth;copy.classList.add('changing');
  if(focus)tab.focus();
}
$$('[data-solution]').forEach((button,i,buttons)=>{
  button.addEventListener('click',()=>selectSolution(button.dataset.solution));
  button.addEventListener('keydown',e=>{let next=null;if(['ArrowDown','ArrowRight'].includes(e.key))next=(i+1)%buttons.length;if(['ArrowUp','ArrowLeft'].includes(e.key))next=(i+buttons.length-1)%buttons.length;if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;if(next!==null){e.preventDefault();selectSolution(buttons[next].dataset.solution,true);}});
});
const menu=$('.menu-toggle');
function closeMenu(){menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Открыть меню');$('#mobile-nav').hidden=true;}
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');$('#mobile-nav').hidden=!open;});
$$('#mobile-nav a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('click',e=>{if(!$('.site-header').contains(e.target))closeMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}});
matchMedia('(min-width:821px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
$('.back-top').addEventListener('click',()=>{window.scrollTo({top:0,behavior:reducedMotion.matches?'instant':'smooth'});$('.site-header .brand').focus({preventScroll:true});});
const dialog=$('#contact-dialog'),form=$('#contact-form');
const draftKey='nickel-project-draft-v1';let draft=null,opener=null;
const recipients=new Set(['77011960960','77754469509']);
try{const parsed=JSON.parse(localStorage.getItem(draftKey)||'null');if(parsed&&typeof parsed==='object'&&['name','email','message','direction'].every(k=>typeof parsed[k]==='string'))draft={...parsed,persist:true};}catch{}
function applyDraft(){if(!draft)return;for(const k of ['name','email','message','direction'])form.elements[k].value=draft[k];form.elements.recipient.value=recipients.has(draft.recipient)?draft.recipient:'77011960960';form.elements.consent.checked=Boolean(draft.persist);}
function showForm(){$('#form-view').hidden=false;$('#success-view').hidden=true;$('#form-error').hidden=true;dialog.setAttribute('aria-labelledby','contact-title');}
function openContact(button){opener=button;closeMenu();showForm();applyDraft();if(button.dataset.context==='selected')form.elements.direction.value=selected;if(button.dataset.context==='demo')form.elements.direction.value='automation';dialog.showModal();document.body.style.overflow='hidden';requestAnimationFrame(()=>{if(matchMedia('(pointer:fine)').matches)form.elements.name.focus({preventScroll:true});else{$('#contact-title').tabIndex=-1;$('#contact-title').focus({preventScroll:true});}});}
$$('[data-open-contact]').forEach(b=>b.addEventListener('click',()=>openContact(b)));
$('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{document.body.style.overflow='';opener?.focus({preventScroll:true});});
function showSuccess(){
  $('#form-view').hidden=true;$('#success-view').hidden=false;
  const h=$('#success-view h2');h.id='success-title';dialog.setAttribute('aria-labelledby','success-title');
  $('.success-description').textContent='Проверьте сообщение и нажмите «Отправить» в WhatsApp. Если чат не открылся, используйте кнопку ниже. Сайт не отслеживает доставку.';
  $('#summary-direction').textContent=directions[draft.direction]?.name||'Обсуждение проекта';
  $('#summary-message').textContent=draft.message;
  $('#whatsapp-request').href=`https://wa.me/${draft.recipient}?text=${encodeURIComponent(requestText())}`;
  dialog.scrollTop=0;h.focus({preventScroll:true});
}
form.addEventListener('submit',e=>{
  e.preventDefault();
  const name=form.elements.name.value.trim(),email=form.elements.email.value.trim(),message=form.elements.message.value.trim();
  if(name.length<2||name.length>100||message.length<10||message.length>1200){
    const err=$('#form-error');err.textContent='Укажите имя (от 2 до 100 символов) и опишите задачу (от 10 до 1 200 символов).';err.hidden=false;
    (name.length<2||name.length>100?form.elements.name:form.elements.message).focus();return;
  }
  const recipient=recipients.has(form.elements.recipient.value)?form.elements.recipient.value:'77011960960';
  draft={name,email,message,recipient,direction:form.elements.direction.value,createdAt:new Date().toISOString(),persist:form.elements.consent.checked};
  try{if(draft.persist)localStorage.setItem(draftKey,JSON.stringify(draft));else localStorage.removeItem(draftKey);}catch{if(draft.persist)toast('Не удалось сохранить черновик. Сообщение доступно для отправки в WhatsApp.');}
  showSuccess();
  // A visitor confirms the actual send in WhatsApp; opening the chat is not delivery.
  $('#whatsapp-request').click();
});
function requestText(){return `Здравствуйте! Хочу обсудить проект с Nickel Labs.\n\nИмя: ${draft.name}${draft.email?`\nEmail: ${draft.email}`:''}\nНаправление: ${directions[draft.direction]?.name||'Нужна помощь с выбором'}\n\n${draft.message}`;}
$('#download-request').addEventListener('click',()=>{if(!draft)return;const blob=new Blob(['\ufeff'+requestText()],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Nickel-Labs-project-request.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
let toastTimer;function toast(message){clearTimeout(toastTimer);$('.toast').textContent=message;$('.toast').classList.add('show');toastTimer=setTimeout(()=>$('.toast').classList.remove('show'),3500);}
$('#copy-request').addEventListener('click',async()=>{if(!draft)return;try{await navigator.clipboard.writeText(requestText());toast('Заявка скопирована');}catch{toast('Браузер не разрешил копирование. Скачайте заявку.');}});
$('#edit-request').addEventListener('click',()=>{showForm();form.elements.message.focus();});
$('#delete-request').addEventListener('click',()=>{try{localStorage.removeItem(draftKey);}catch{}draft=null;form.reset();showForm();toast('Черновик удалён');form.elements.name.focus();});
