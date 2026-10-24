const tabs=[...document.querySelectorAll("[data-feed]")];
const videos=[...document.querySelectorAll(".video")];
const searchForm=document.getElementById("searchForm");
const searchInput=document.getElementById("searchInput");
const status=document.getElementById("status");
let activeFeed="For You";
function showStatus(message){status.textContent=message;status.hidden=!message}
function render(){
  const query=searchInput.value.trim().toLowerCase();
  let count=0;
  for(const video of videos){
    const matchesFeed=activeFeed==="For You"||video.dataset.feed==="Following";
    const matchesQuery=!query||(video.dataset.title+" "+video.dataset.creator).toLowerCase().includes(query);
    video.hidden=!(matchesFeed&&matchesQuery);
    if(!video.hidden)count++;
  }
  if(query)showStatus(count?count+" video"+(count===1?"":"s")+" found.":"No videos found. Try another search.");
  else if(activeFeed==="Following")showStatus("You're all caught up — followed creators will appear here.");
  else showStatus("");
}
tabs.forEach(tab=>tab.addEventListener("click",()=>{
  activeFeed=tab.dataset.feed;
  tabs.forEach(item=>{
    const active=item===tab;
    item.classList.toggle("active",active);
    item.setAttribute("aria-pressed",String(active));
  });
  render();
}));
searchForm.addEventListener("submit",event=>{event.preventDefault();render()});
searchInput.addEventListener("input",render);
document.querySelectorAll(".thumbnail").forEach(button=>button.addEventListener("click",()=>{
  const video=button.closest(".video");
  showStatus(video.dataset.title+" · "+video.dataset.creator);
}));
document.getElementById("accountButton").addEventListener("click",()=>showStatus("Account settings will be available here."));
