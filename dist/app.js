const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const directions = {
  systems: {name:'Цифровой продукт или система', title:'Цифровые продукты и системы', description:'Проектируем и запускаем решения под конкретный бизнес-процесс — от первой версии до системы, готовой к росту и интеграциям.', examples:['Личные кабинеты и B2B-порталы','Внутренние системы и сервисы','API и интеграционные платформы']},
  ai: {name:'AI в рабочих процессах', title:'AI в рабочих процессах', description:'Подключаем AI к вашим данным и операциям: он находит информацию, обрабатывает документы и выполняет отдельные шаги процесса. Перед запуском проверяем точность, безопасность и стоимость.', examples:['AI-ассистенты и агенты','Поиск по корпоративным знаниям','Обработка документов и обращений']},
  automation: {name:'Автоматизация операций', title:'Автоматизация операций', description:'Сначала упрощаем процесс, затем автоматизируем маршруты, проверки и обмен данными. Типовые операции выполняет система, сотрудники подключаются к исключениям.', examples:['Заявки и согласования','Сверки, отчёты и уведомления','Связка CRM, ERP и внешних сервисов']},
  consulting: {name:'Архитектура и модернизация', title:'Архитектура и модернизация', description:'Проверяем, выдержит ли текущая система рост нагрузки, новые интеграции и AI-сценарии. На выходе — целевая схема, приоритеты и реалистичный план перехода.', examples:['Аудит архитектуры и кода','План поэтапной модернизации','Надёжность, безопасность и стоимость владения']}
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
  $('.solution-examples').replaceChildren(...d.examples.map(text=>{const item=document.createElement('li');item.textContent=text;return item;}));
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
try{const parsed=JSON.parse(localStorage.getItem(draftKey)||'null');if(parsed&&typeof parsed==='object'&&['name','email','message','direction'].every(k=>typeof parsed[k]==='string'))draft=parsed;}catch{}
function applyDraft(){if(!draft)return;for(const k of ['name','email','message','direction'])form.elements[k].value=draft[k];form.elements.consent.checked=false;}
function showForm(){$('#form-view').hidden=false;$('#success-view').hidden=true;$('#form-error').hidden=true;dialog.setAttribute('aria-labelledby','contact-title');}
function openContact(button){opener=button;closeMenu();showForm();applyDraft();if(button.dataset.context==='selected')form.elements.direction.value=selected;dialog.showModal();document.body.style.overflow='hidden';requestAnimationFrame(()=>form.elements.name.focus({preventScroll:true}));}
$$('[data-open-contact]').forEach(b=>b.addEventListener('click',()=>openContact(b)));
$('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{document.body.style.overflow='';opener?.focus({preventScroll:true});});
function showSuccess(saved){$('#form-view').hidden=true;$('#success-view').hidden=false;const h=$('#success-view h2');h.id='success-title';dialog.setAttribute('aria-labelledby','success-title');$('.success-description').textContent=saved?'Черновик сохранён в этом браузере. Он ещё не отправлен в Nickel Labs.':'Данные подготовлены, но браузер не разрешил сохранить черновик. Скачайте заявку — в Nickel Labs она ещё не отправлена.';$('#summary-direction').textContent=directions[draft.direction]?.name||'Нужна помощь с выбором направления';$('#summary-message').textContent=draft.message;dialog.scrollTop=0;h.focus({preventScroll:true});}
form.addEventListener('submit',e=>{e.preventDefault();const name=form.elements.name.value.trim(),email=form.elements.email.value.trim(),message=form.elements.message.value.trim();if(name.length<2||message.length<10){const err=$('#form-error');err.textContent='Укажите имя (минимум 2 символа) и опишите задачу (минимум 10 символов).';err.hidden=false;(name.length<2?form.elements.name:form.elements.message).focus();return;}draft={name,email,message,direction:form.elements.direction.value,createdAt:new Date().toISOString()};let saved=false;try{localStorage.setItem(draftKey,JSON.stringify(draft));saved=true;}catch{}showSuccess(saved);});
function requestText(){return `Nickel Labs — заявка на обсуждение проекта\nIntelligence in Every System\n\nСтатус: подготовлена, не отправлена\nИмя: ${draft.name}\nEmail: ${draft.email}\nНаправление: ${directions[draft.direction]?.name||'Пока не определился'}\n\nЗадача:\n${draft.message}\n\nСоздано: ${new Date(draft.createdAt).toLocaleString('ru-RU')}\n`;}
$('#download-request').addEventListener('click',()=>{if(!draft)return;const blob=new Blob(['\ufeff'+requestText()],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Nickel-Labs-project-request.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
let toastTimer;function toast(message){clearTimeout(toastTimer);$('.toast').textContent=message;$('.toast').classList.add('show');toastTimer=setTimeout(()=>$('.toast').classList.remove('show'),3500);}
$('#copy-request').addEventListener('click',async()=>{if(!draft)return;try{await navigator.clipboard.writeText(requestText());toast('Заявка скопирована');}catch{toast('Браузер не разрешил копирование. Скачайте заявку.');}});
$('#edit-request').addEventListener('click',()=>{showForm();form.elements.message.focus();});
$('#delete-request').addEventListener('click',()=>{try{localStorage.removeItem(draftKey);}catch{}draft=null;form.reset();showForm();toast('Черновик удалён');form.elements.name.focus();});
