import "./style.css";

const EVENT_NAME = "COAST WAVE";
const EVENT_DATE = new Date("2026-12-12T15:00:00+03:00");

document.querySelector("#app").innerHTML = `
  <header class="nav-wrap">
    <nav class="nav container">
      <a class="brand" href="#top">${EVENT_NAME}</a>

      <div class="nav-links">
        <a href="#experience">Experience</a>
        <a href="#tickets">Tickets</a>
        <a href="#lineup">Lineup</a>
        <a href="#location">Location</a>
        <a href="#faq">FAQ</a>
      </div>

      <a class="btn btn-small" href="#tickets">Buy Ticket</a>
    </nav>
  </header>

  <main id="top">

    <!-- HERO -->
    <section class="hero">
      <div class="hero-overlay"></div>
      <div class="hero-noise"></div>

      <div class="container hero-content">
        <p class="eyebrow">MALINDI • EDITION 001 • KENYA</p>

        <h1>${EVENT_NAME}</h1>

        <p class="hero-sub">
          Sunset. Afrobeats. Amapiano. Dancehall.<br/>
          One unforgettable night on the coast.
        </p>

        <div class="event-meta">
          <span>Saturday, 12 December 2026</span>
          <span>3:00 PM — Late</span>
          <span>Malindi • Venue TBA</span>
        </div>

        <div class="hero-actions">
          <a class="btn btn-primary" href="#tickets">Get Tickets</a>
          <a class="btn btn-ghost" href="#experience">Explore Event</a>
        </div>

        <div class="countdown" aria-label="Countdown to event">
          <div>
            <strong id="days">--</strong>
            <span>Days</span>
          </div>

          <div>
            <strong id="hours">--</strong>
            <span>Hours</span>
          </div>

          <div>
            <strong id="minutes">--</strong>
            <span>Minutes</span>
          </div>

          <div>
            <strong id="seconds">--</strong>
            <span>Seconds</span>
          </div>
        </div>
      </div>
    </section>

    <!-- MARQUEE -->
    <section class="strip">
      <div class="marquee">
        <span>
          AFROBEATS ✦ AMAPIANO ✦ DANCEHALL ✦ R&B ✦ SUNSET ✦ BEACH ✦ MALINDI ✦
        </span>

        <span>
          AFROBEATS ✦ AMAPIANO ✦ DANCEHALL ✦ R&B ✦ SUNSET ✦ BEACH ✦ MALINDI ✦
        </span>
      </div>
    </section>

    <!-- EXPERIENCE -->
    <section id="experience" class="section container">
      <div class="section-head">
        <p class="eyebrow dark">THE EXPERIENCE</p>
        <h2>More than a party.<br/>A coastal experience.</h2>
      </div>

      <div class="feature-grid">

        <article class="feature-card feature-big">
          <div class="feature-number">01</div>
          <h3>Sunset to late</h3>
          <p>Arrive for golden hour, stay for the energy after dark.</p>
        </article>

        <article class="feature-card feature-sound">
          <div class="feature-number">02</div>
          <h3>Curated sound</h3>
          <p>Afrobeats, Amapiano, Dancehall, Kenyan hits and R&B.</p>
        </article>

        <article class="feature-card feature-vip">
          <div class="feature-number">03</div>
          <h3>VIP experience</h3>
          <p>Priority entry and dedicated premium areas.</p>
        </article>

      </div>
    </section>

    <!-- TICKETS -->
    <section id="tickets" class="section tickets-section">
      <div class="container">

        <div class="section-head center">
          <p class="eyebrow">TICKETS</p>
          <h2>Choose your wave.</h2>

          <p class="muted-light">
            Buy early and save. Gate prices will be higher on event day.
          </p>
        </div>

        <div class="ticket-grid">

          <!-- SUPER EARLY BIRD -->
          <article class="ticket-card">
            <div>
              <span class="ticket-label">LIMITED</span>
              <h3>Super Early Bird</h3>
              <p>First release</p>
            </div>

            <div class="price">KSh 1,500</div>

            <button
              class="ticket-btn"
              data-ticket="Super Early Bird"
              data-price="1500"
            >
              Select Ticket
            </button>
          </article>

          <!-- EARLY BIRD -->
          <article class="ticket-card featured">
            <div>
              <span class="ticket-label">MOST POPULAR</span>
              <h3>Early Bird</h3>
              <p>Second release</p>
            </div>

            <div class="price">KSh 2,000</div>

            <button
              class="ticket-btn"
              data-ticket="Early Bird"
              data-price="2000"
            >
              Select Ticket
            </button>
          </article>

          <!-- REGULAR -->
          <article class="ticket-card">
            <div>
              <span class="ticket-label">STANDARD</span>
              <h3>Regular</h3>
              <p>Final online release</p>
            </div>

            <div class="price">KSh 2,500</div>

            <button
              class="ticket-btn"
              data-ticket="Regular"
              data-price="2500"
            >
              Select Ticket
            </button>
          </article>

          <!-- VIP ADVANCE -->
          <article class="ticket-card">
            <div>
              <span class="ticket-label">PREMIUM</span>
              <h3>VIP Advance</h3>
              <p>Priority premium experience</p>
            </div>

            <div class="price">KSh 5,000</div>

            <button
              class="ticket-btn"
              data-ticket="VIP Advance"
              data-price="5000"
            >
              Select VIP
            </button>
          </article>

        </div>

        <!-- GATE PRICES -->
        <div class="gate-pricing">
          <div class="gate-pricing-head">
            <p class="eyebrow">EVENT DAY</p>
            <h3>Gate Passes</h3>
            <p>
              Didn't buy online? Gate tickets will be available
              subject to capacity.
            </p>
          </div>

          <div class="gate-pricing-grid">

            <div class="gate-price-card">
              <span>GENERAL GATE</span>
              <strong>KSh 3,000</strong>
              <small>Event-day entry</small>
            </div>

            <div class="gate-price-card vip-gate">
              <span>VIP GATE</span>
              <strong>KSh 7,000</strong>
              <small>Subject to VIP availability</small>
            </div>

          </div>

          <p class="gate-note">
            Gate passes are subject to availability.
            Entry closes once approved event capacity is reached.
          </p>
        </div>

        <!-- CHECKOUT -->
        <div class="checkout" id="checkout">

          <div>
            <p class="eyebrow dark">YOUR SELECTION</p>
            <h3 id="selected-ticket">Choose a ticket above</h3>
            <p id="selected-price">
              Secure M-Pesa checkout will appear here.
            </p>
          </div>

          <form id="ticket-form">

            <input
              id="name"
              type="text"
              placeholder="Full name"
              required
            />

            <input
              id="phone"
              type="tel"
              placeholder="M-Pesa number e.g. 0712 345 678"
              required
            />

            <input
              id="email"
              type="email"
              placeholder="Email address"
              required
            />

            <button
              class="btn btn-primary full"
              type="submit"
            >
              Continue to M-Pesa
            </button>

            <small>
              No payment is processed yet — M-Pesa integration comes next.
            </small>

          </form>
        </div>

      </div>
    </section>

    <!-- LINEUP -->
    <section id="lineup" class="section container">

      <div class="section-head">
        <p class="eyebrow dark">LINEUP</p>
        <h2>The coast will hear us.</h2>
      </div>

      <div class="lineup-grid">

        <div class="artist-card headliner-card">
          <span>HEADLINER</span>
          <strong>TO BE ANNOUNCED</strong>
          <p>One name. One unforgettable night.</p>
        </div>

        <div class="artist-card">
          <span>DJ 01</span>
          <strong>COMING SOON</strong>
          <p>Afrobeats • Amapiano • Kenyan hits</p>
        </div>

        <div class="artist-card">
          <span>DJ 02</span>
          <strong>COMING SOON</strong>
          <p>Dancehall • R&B • Afrobeats</p>
        </div>

        <div class="artist-card">
          <span>HOST</span>
          <strong>COMING SOON</strong>
          <p>From sunset to late.</p>
        </div>

      </div>

      <p class="lineup-note">
        More names dropping soon.
      </p>

    </section>

    <!-- LOCATION -->
    <section id="location" class="section location-section">
      <div class="container location-card">

        <div>
          <p class="eyebrow">LOCATION</p>
          <h2>Malindi, Kenya</h2>
          <p>Beach venue announcement coming soon.</p>
        </div>

        <div class="location-stamp">
          <strong>12</strong>
          <span>DEC<br/>2026</span>
        </div>

      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="section container faq-section">

      <div class="section-head">
        <p class="eyebrow dark">FAQ</p>
        <h2>Before you arrive.</h2>
      </div>

      <div class="faq-list">

        <details>
          <summary>Where is the exact venue?</summary>
          <p>
            The confirmed Malindi beach venue will be announced
            after the venue agreement is finalized.
          </p>
        </details>

        <details>
          <summary>How will tickets work?</summary>
          <p>
            After successful M-Pesa payment, buyers will receive
            a unique digital ticket with a QR code for entry.
          </p>
        </details>

        <details>
          <summary>Can I buy a ticket at the gate?</summary>
          <p>
            Yes, subject to availability. General Gate is KSh 3,000
            and VIP Gate is KSh 7,000. Gate sales stop once approved
            event capacity is reached.
          </p>
        </details>

        <details>
          <summary>Can I transfer my ticket?</summary>
          <p>
            Transfer rules will be published with the final ticket
            terms before sales open.
          </p>
        </details>

        <details>
          <summary>Will food and drinks be available?</summary>
          <p>
            Yes. Final food, beverage and bar partners will be
            announced before the event.
          </p>
        </details>

      </div>
    </section>

    <!-- FINAL CTA -->
    <section class="cta-section">
      <div class="container cta-inner">

        <p class="eyebrow">
          MALINDI • DECEMBER 12
        </p>

        <h2>
          Meet us where the<br/>
          ocean meets the music.
        </h2>

        <a
          class="btn btn-light"
          href="#tickets"
        >
          Get Your Ticket
        </a>

      </div>
    </section>

  </main>

  <!-- FOOTER -->
  <footer>
    <div class="container footer-inner">

      <strong>${EVENT_NAME}</strong>

      <p>
        Malindi Edition 001 • December 12, 2026
      </p>

      <div class="footer-links">
        <a href="#">Instagram</a>
        <a href="#">TikTok</a>
        <a href="#">WhatsApp</a>
      </div>

    </div>
  </footer>

  <div class="toast" id="toast">
    Ticket selected.
  </div>
`;


/* ==============================
   COUNTDOWN
================================ */

function updateCountdown() {
  const now = new Date();
  let diff = EVENT_DATE - now;

  if (diff <= 0) {
    const countdown = document.querySelector(".countdown");

    if (countdown) {
      countdown.innerHTML =
        "<strong>THE WAVE IS HERE</strong>";
    }

    return;
  }

  const days = Math.floor(diff / 86400000);

  diff %= 86400000;

  const hours = Math.floor(diff / 3600000);

  diff %= 3600000;

  const minutes = Math.floor(diff / 60000);

  const seconds = Math.floor(
    (diff % 60000) / 1000
  );

  document.querySelector("#days").textContent =
    days;

  document.querySelector("#hours").textContent =
    String(hours).padStart(2, "0");

  document.querySelector("#minutes").textContent =
    String(minutes).padStart(2, "0");

  document.querySelector("#seconds").textContent =
    String(seconds).padStart(2, "0");
}

updateCountdown();

setInterval(updateCountdown, 1000);


/* ==============================
   TICKET SELECTION
================================ */

let currentTicket = null;

document
  .querySelectorAll(".ticket-btn")
  .forEach((button) => {

    button.addEventListener("click", () => {

      currentTicket = {
        name: button.dataset.ticket,
        price: button.dataset.price,
      };

      document.querySelector(
        "#selected-ticket"
      ).textContent = currentTicket.name;

      document.querySelector(
        "#selected-price"
      ).textContent =
        `KSh ${Number(
          currentTicket.price
        ).toLocaleString()} • 1 ticket`;

      document
        .querySelector("#checkout")
        .scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

      const toast =
        document.querySelector("#toast");

      toast.textContent =
        `${currentTicket.name} selected`;

      toast.classList.add("show");

      setTimeout(() => {
        toast.classList.remove("show");
      }, 1800);

    });

  });


/* ==============================
   CHECKOUT FORM
================================ */

document
  .querySelector("#ticket-form")
  .addEventListener("submit", (event) => {

    event.preventDefault();

    const toast =
      document.querySelector("#toast");

    if (!currentTicket) {

      toast.textContent =
        "Please select a ticket first.";

      toast.classList.add("show");

      setTimeout(() => {
        toast.classList.remove("show");
      }, 1800);

      return;
    }

    const name =
      document.querySelector("#name").value.trim();

    const phone =
      document.querySelector("#phone").value.trim();

    const email =
      document.querySelector("#email").value.trim();

    console.log({
      ticket: currentTicket.name,
      price: currentTicket.price,
      name,
      phone,
      email,
    });

    toast.textContent =
      "Ready for M-Pesa integration.";

    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 2200);

  });