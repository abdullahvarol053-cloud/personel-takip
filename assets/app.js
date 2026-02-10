let selectedType=null;
const personel=document.getElementById('personel');
const note=document.getElementById('note');
const sendBtn=document.getElementById('send');

personel.onchange=unlock;
note.oninput=unlock;

function setType(t){selectedType=t;unlock();}

function unlock(){
  if(personel.value && note.value.trim().length>0){
    sendBtn.disabled=false;
  } else {
    sendBtn.disabled=true;
  }
}

function send(){
  alert(
    "KAYIT GÖNDERİLDİ\n"+
    "Personel: "+personel.value+"\n"+
    "Tür: "+(selectedType||"not")+"\n"+
    "Not: "+note.value
  );
}