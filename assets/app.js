let selectedType=null;
const personel=document.getElementById('personel');
const note=document.getElementById('note');
const sendBtn=document.getElementById('send');
personel.onchange=unlock;
note.oninput=unlock;
function setType(t){selectedType=t;unlock();}
function unlock(){if(personel.value){sendBtn.disabled=false;}}
function send(){alert("TEST KAYIT GÖNDERİLDİ\nPersonel:"+personel.value+"\nTür:"+selectedType+"\nNot:"+note.value);}