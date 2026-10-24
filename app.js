const tabs=[...document.querySelectorAll("[data-feed]")];
const videos=[...document.querySelectorAll(".video")];
const searchForm=document.getElementById("searchForm");
const searchInput=document.getElementById("searchInput");
const status=document.getElementById("status");
let activeFeed="For You";
function render(){const query=searchInput.value.trim().toLowerCase();let count=0;for(const video of videos){const matchesFeed=activeFeed==="For You"||video.dataset.feed==="Following";const matchesQuery=!query||(video.dataset.title+" "+video.dataset.creator).toLowerCase().includes(query);video.hidden=!(matchesFeed&&matchesQuery);if(!video.hidden)count++}status.textContent=count===0?"No videos found. Try another search.":query?count+" video"+(count===1?"":"s")+" found.":""}
tabs.forEach(tab=>tab.addEventListener("click",()=>{activeFeed=tab.dataset.feed;tabs.forEach(item=>item.classList.toggle("active",item===tab));render();if(activeFeed==="Following")status.textContent="You're all caught up — followed creators will appear here."}));
searchForm.addEventListener("submit",event=>{event.preventDefault();render()});
searchInput.addEventListener("input",render);
document.getElementById("accountButton").addEventListener("click",()=>{status.textContent="Account settings will be available here."});
document.querySelectorAll(".thumbnail").forEach(button=>button.addEventListener("click",()=>{const video=button.closest(".video");status.textContent=video.dataset.title+" · "+video.dataset.creator}));
