// Load markdown
fetch("about.md")
  .then(res => res.text())
  .then(md => {
    document.getElementById("about").innerHTML = marked.parse(md);
  });

// Load the navbar
fetch("navbar.html")
  .then(res => res.text())
  .then(html => {
    document.getElementById("navbar").innerHTML = html;

    // highlight current page
    const links = document.querySelectorAll("nav a");
    links.forEach(link => {
      if (link.href === window.location.href) {
        link.classList.add("active");
      }
    });
  });

// Hamburger menu navbar on mobile
document.addEventListener("click", (e) => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav-links");

  if (!toggle || !nav) return;

  if (toggle.contains(e.target)) {
    nav.classList.toggle("open");
  } else {
    nav.classList.remove("open");
  }
});

// Featured press
const press = [
  {
    title: "Why a new type of bird is making its presence felt in the Pacific Northwest",
    url: "https://columbiainsight.org/why-a-new-type-of-bird-is-making-its-presence-felt-in-the-pacific-northwest/",
    excerpt: "'“Five, ten years ago there were no lesser goldfinches in the area at all,” says Maron. Today flocks of lesser goldfinches are common in many areas of the Columbia River Basin. A few decades ago, however, they were almost unknown in the Pacific Northwest outside of the Willamette Valley...'",
    date: "2025-07-03"
  },
  {
    title: "A Bigger Range for the Lesser Goldfinch",
    url: "https://www.allaboutbirds.org/news/bigger-range-lesser-goldfinch/",
    excerpt: "'Researchers from Washington State University and the Cornell Lab of Ornithology analyzed bird-observation data from two participatory-science initiatives from the Cornell Lab—Project FeederWatch and eBird—to track Lesser Goldfinch range changes over the past 25 years. The study, published in the journal Ornithology in April, shows that Lesser Goldfinch year-round populations more than doubled in size in Washington State, while also increasing substantially in Idaho and Oregon...'",
    date: "2025-06-27"
  },
  {
    title: "A Bug’s Life Under Rough-legged Hawk Feathers",
    url: "http://wos.org/documents/wosnews/wosnews203.pdf",
    excerpt: "'I had set out with the assumption that more lice meant worse health for the birds, but I instead found a more complex relationship: younger hawks typically carried more lice than adults, and females of all ages typically carried more than males. There also seemed to be a relationship between lice load and health amongst the females, with birds carrying larger loads being in worse health, but not amongst the males...'",
    date: "2024-10-01"
  }
];

const pressList = document.getElementById("press-list");

if (pressList) {
  press.forEach(item => {
    const div = document.createElement("div");
    div.className = "press-item";
    div.innerHTML = `
      <h3><a href="${item.url}" target="_blank">${item.title}</a></h3>
      <p>${item.excerpt}</p>
      <span>${item.date}</span>
    `;
    pressList.appendChild(div);
  });
}
