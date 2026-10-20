import {
  renderAdmin,
  renderAdminDashboard,
} from "./admin";

import { supabase } from "./supabase.js";
import "./style.css";

const path = window.location.pathname;

/* =====================================================
   ADMIN ROUTES
===================================================== */

if (path === "/admin" || path === "/admin/") {
  renderAdmin();

} else if (
  path === "/admin/dashboard" ||
  path === "/admin/dashboard/"
) {
  renderAdminDashboard();

} else {

  /* =====================================================
     PUBLIC COAST WAVE WEBSITE
  ===================================================== */

  const EVENT_NAME = "COAST WAVE";
  const EVENT_EDITION = "MALINDI 001";

  const EVENT_DATE = new Date("2027-03-27T15:00:00+03:00");

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

          <p class="hero-edition">${EVENT_EDITION}</p>

          <p class="hero-sub">
          Meet us on the coast.<br/>
          Afrobeats. Amapiano. Dancehall. Kenyan hits.
          </p>

          <div class="event-meta">
          <span>Saturday, 27 March 2027</span>
          <span>3:00 PM — Late</span>
          <span>Lost Beach • Malindi</span>
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

          <h2>
            More than a party.<br/>
            A coastal experience.
          </h2>
        </div>

        <div class="feature-grid">

          <article class="feature-card feature-big">
            <div class="feature-number">01</div>
            <h3>Sunset to late</h3>
            <p>
              Arrive for golden hour, stay for the energy after dark.
            </p>
          </article>

          <article class="feature-card feature-sound">
            <div class="feature-number">02</div>
            <h3>Curated sound</h3>
            <p>
              Afrobeats, Amapiano, Dancehall, Kenyan hits and R&B.
            </p>
          </article>

          <article class="feature-card feature-vip">
            <div class="feature-number">03</div>
            <h3>VIP experience</h3>
            <p>
              Priority entry and dedicated premium areas.
            </p>
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

            <!-- VIP -->
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

          <!-- GATE PASSES -->
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

              <div

            class="gate-price-card"
            data-gate-ticket="General Gate"
            >
            <span>GENERAL GATE</span>
            <strong>KSh 3,000</strong>
            <small>Event-day entry</small>
            </div>

           <div class="gate-price-card vip-gate"
                data-gate-ticket="VIP Gate"
                >
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

              <h3 id="selected-ticket">
                Choose a ticket above
              </h3>

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
                Your order will be reserved while your M-PESA payment is verified.
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
            <img class="artist-card__image" src="/images/coast-wave-headliner-sunset-1200.webp" srcset="/images/coast-wave-headliner-sunset-640.webp 640w, /images/coast-wave-headliner-sunset-1200.webp 1200w" sizes="(max-width: 780px) calc(100vw - 40px), (max-width: 1220px) 60vw, 710px" alt="" width="1200" height="670" loading="lazy" decoding="async" />
            <span>HEADLINER</span>
            <strong>TO BE ANNOUNCED</strong>
            <p class="artist-tagline">One name. One unforgettable night.</p>
          </div>

          <div class="artist-card artist-card--dj">
            <img class="artist-card__image" src="/images/coast-wave-dj-01-beach-1200.webp" srcset="/images/coast-wave-dj-01-beach-640.webp 640w, /images/coast-wave-dj-01-beach-1200.webp 1200w" sizes="(max-width: 780px) calc(100vw - 40px), (max-width: 1220px) 60vw, 710px" alt="" width="1200" height="662" loading="lazy" decoding="async" />
            <span>DJ 01</span>
            <strong>COMING SOON</strong>
            <p class="artist-genres"><span>Afrobeats</span><i aria-hidden="true">&bull;</i><span>Amapiano</span><i aria-hidden="true">&bull;</i><span>Kenyan hits</span></p>
          </div>

          <div class="artist-card artist-card--dj">
            <img class="artist-card__image" src="/images/coast-wave-dj-02-stage-1200.webp" srcset="/images/coast-wave-dj-02-stage-640.webp 640w, /images/coast-wave-dj-02-stage-1200.webp 1200w" sizes="(max-width: 780px) calc(100vw - 40px), (max-width: 1220px) 60vw, 710px" alt="" width="1200" height="670" loading="lazy" decoding="async" />
            <span>DJ 02</span>
            <strong>COMING SOON</strong>
            <p class="artist-genres"><span>Dancehall</span><i aria-hidden="true">&bull;</i><span>R&amp;B</span><i aria-hidden="true">&bull;</i><span>Afrobeats</span></p>
          </div>

          <div class="artist-card artist-card--host">
            <img class="artist-card__image" src="/images/coast-wave-host-mc-1200.webp" srcset="/images/coast-wave-host-mc-640.webp 640w, /images/coast-wave-host-mc-1200.webp 1200w" sizes="(max-width: 780px) calc(100vw - 40px), (max-width: 1220px) 60vw, 710px" alt="" width="1200" height="300" loading="lazy" decoding="async" />
            <span>HOST</span>
            <strong>COMING SOON</strong>
            <p class="artist-tagline">From sunset to late.</p>
          </div>

        </div>

        <p class="lineup-note">
          More names dropping soon.
        </p>

      </section>

      <!-- LOCATION -->
      <section
        id="location"
        class="section location-section"
        aria-labelledby="location-title"
      >
        <div class="container location-card">
          <div class="location-copy">
            <p class="eyebrow location-eyebrow">THE LOCATION</p>
            <h2 id="location-title">Lost<br/>Beach</h2>
            <p class="location-address">Malindi, Kenya.</p>
            <div class="location-schedule">
              <p>Saturday, 27 March 2027</p>
              <span>3:00 PM &mdash; Late</span>
            </div>
            <a
              class="location-link"
              href="https://www.google.com/maps/search/?api=1&query=Lost+Beach+Malindi+Kenya"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Explore Lost Beach in Google Maps (opens in a new tab)"
            >
              Explore the location
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 19 19 5M5 5h14v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          </div>
          <figure class="location-visual">
            <div class="location-image-wrap">
              <img
                class="location-image"
                src="/images/coast-wave-location-1200.webp"
                srcset="/images/coast-wave-location-640.webp 640w, /images/coast-wave-location-1200.webp 1200w, /images/coast-wave-location-2000.webp 2000w"
                sizes="(max-width: 900px) calc(100vw - 40px), (max-width: 1600px) 66vw, 1060px"
                width="2400"
                height="1340"
                loading="lazy"
                decoding="async"
                alt="Coast Wave poolside lounge with turquoise water, palm trees, sunset loungers and a warmly lit DJ pavilion."
              />
              <div class="location-stamp" aria-label="27 March 2027">
                <span class="location-stamp-dot" aria-hidden="true"></span>
                <strong>27</strong>
                <span>MAR<br/>2027</span>
              </div>
            </div>
          </figure>
        </div>
      </section>

      <!-- FAQ -->
      <section
        id="faq"
        class="section container faq-section"
      >

        <div class="section-head">
          <p class="eyebrow dark">FAQ</p>
          <h2>Before you arrive.</h2>
        </div>

        <div class="faq-list">

          <details>
            <summary>
              Where is the exact venue?
            </summary>

            <p>
              Lost Beach, Malindi, Kenya.
            </p>
          </details>

          <details>
            <summary>
              How will tickets work?
            </summary>

            <p>
              After successful M-Pesa payment, buyers will receive
              a unique digital ticket with a QR code for entry.
            </p>
          </details>

          <details>
            <summary>
              Can I buy a ticket at the gate?
            </summary>

            <p>
              Yes, subject to availability. General Gate is
              KSh 3,000 and VIP Gate is KSh 7,000.
              Gate sales stop once approved event capacity is reached.
            </p>
          </details>

          <details>
            <summary>
              Can I transfer my ticket?
            </summary>

            <p>
              Transfer rules will be published with the final ticket
              terms before sales open.
            </p>
          </details>

          <details>
            <summary>
              Will food and drinks be available?
            </summary>

            <p>
              Yes. Final food, beverage and bar partners will be
              announced before the event.
            </p>
          </details>

        </div>
      </section>

      <!-- CTA -->
      <section class="cta-section">
        <div class="container cta-inner">

          <p class="eyebrow">
            MALINDI • MARCH 27
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

        <strong>
          ${EVENT_NAME}
        </strong>

        <p>
          Malindi Edition 001 • March 27, 2027
        </p>

        <div class="footer-links">
       <a href="#">Instagram</a>
       <a href="#">TikTok</a>
       <a href="#">WhatsApp</a>
       <a href="/admin">Admin Sign In</a>
        </div>

      </div>
    </footer>

    <div
      class="toast"
      id="toast"
    >
      Ticket selected.
    </div>
  `;


  /* =====================================================
     COUNTDOWN
  ===================================================== */

  function updateCountdown() {

    const now = new Date();

    let diff =
      EVENT_DATE - now;

    if (diff <= 0) {

      const countdown =
        document.querySelector(".countdown");

      if (countdown) {

        countdown.innerHTML =
          "<strong>THE WAVE IS HERE</strong>";

      }

      return;
    }

    const days =
      Math.floor(
        diff / 86400000
      );

    diff %= 86400000;

    const hours =
      Math.floor(
        diff / 3600000
      );

    diff %= 3600000;

    const minutes =
      Math.floor(
        diff / 60000
      );

    const seconds =
      Math.floor(
        (diff % 60000) / 1000
      );

    document
      .querySelector("#days")
      .textContent =
      days;

    document
      .querySelector("#hours")
      .textContent =
      String(hours).padStart(
        2,
        "0"
      );

    document
      .querySelector("#minutes")
      .textContent =
      String(minutes).padStart(
        2,
        "0"
      );

    document
      .querySelector("#seconds")
      .textContent =
      String(seconds).padStart(
        2,
        "0"
      );

  }

  updateCountdown();

  setInterval(
    updateCountdown,
    1000
  );

  /* =====================================================
   LOAD LIVE TICKETS FROM SUPABASE
===================================================== */

async function loadPublicTickets() {
  const {
    data: tickets,
    error,
  } = await supabase
    .from("tickets")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(
      "Unable to load live ticket data:",
      error
    );

    return;
  }

  tickets.forEach((ticket) => {
    const button = document.querySelector(
      `.ticket-btn[data-ticket="${ticket.name}"]`
    );

    if (!button) return;

    const card =
      button.closest(".ticket-card");

    if (!card) return;


    /* ---------------------------------------------
       LIVE PRICE
    --------------------------------------------- */

    const price =
      card.querySelector(".price");

    if (price) {
      price.textContent =
        `KSh ${Number(
          ticket.price
        ).toLocaleString()}`;
    }

    button.dataset.price =
      ticket.price;

    button.dataset.status =
      ticket.status;


    /* ---------------------------------------------
       LIVE STATUS BADGE
    --------------------------------------------- */

    let statusBadge =
      card.querySelector(
        ".public-ticket-status"
      );

    if (!statusBadge) {
      statusBadge =
        document.createElement("span");

      card.appendChild(statusBadge);
    }

    statusBadge.className =
      `public-ticket-status ${ticket.status}`;

    if (ticket.status === "active") {
      statusBadge.textContent =
        "ON SALE";
    }

    if (ticket.status === "upcoming") {
      statusBadge.textContent =
        "COMING SOON";
    }

    if (ticket.status === "sold_out") {
      statusBadge.textContent =
        "SOLD OUT";
    }

    if (ticket.status === "disabled") {
      statusBadge.textContent =
        "UNAVAILABLE";
    }


    /* ---------------------------------------------
       ACTIVE
    --------------------------------------------- */

    if (ticket.status === "active") {
      button.disabled = false;

      button.textContent =
        ticket.name === "VIP Advance"
          ? "Select VIP"
          : "Select Ticket";

      card.classList.remove(
        "ticket-sold-out",
        "ticket-upcoming",
        "ticket-disabled"
      );
    }


    /* ---------------------------------------------
       UPCOMING
    --------------------------------------------- */

    if (ticket.status === "upcoming") {
      button.disabled = true;

      button.textContent =
        "Coming Soon";

      card.classList.add(
        "ticket-upcoming"
      );

      card.classList.remove(
        "ticket-sold-out",
        "ticket-disabled"
      );
    }


    /* ---------------------------------------------
       SOLD OUT
    --------------------------------------------- */

    if (ticket.status === "sold_out") {
      button.disabled = true;

      button.textContent =
        "Sold Out";

      card.classList.add(
        "ticket-sold-out"
      );

      card.classList.remove(
        "ticket-upcoming",
        "ticket-disabled"
      );
    }


    /* ---------------------------------------------
       DISABLED
    --------------------------------------------- */

    if (ticket.status === "disabled") {
      button.disabled = true;

      button.textContent =
        "Unavailable";

      card.classList.add(
        "ticket-disabled"
      );

      card.classList.remove(
        "ticket-upcoming",
        "ticket-sold-out"
      );
    }
  });


  /* ---------------------------------------------
     LIVE GATE PRICES
  --------------------------------------------- */

  const generalGate =
    tickets.find(
      (ticket) =>
        ticket.name === "General Gate"
    );

  const vipGate =
    tickets.find(
      (ticket) =>
        ticket.name === "VIP Gate"
    );

  const gateCards =
    document.querySelectorAll(
      ".gate-price-card"
    );


  if (generalGate && gateCards[0]) {
    const price =
      gateCards[0]
        .querySelector("strong");

    if (price) {
      price.textContent =
        `KSh ${Number(
          generalGate.price
        ).toLocaleString()}`;
    }
  }


  if (vipGate && gateCards[1]) {
    const price =
      gateCards[1]
        .querySelector("strong");

    if (price) {
      price.textContent =
        `KSh ${Number(
          vipGate.price
        ).toLocaleString()}`;
    }
  }
}


await loadPublicTickets();
  let currentTicket = null;

  document
    .querySelectorAll(".ticket-btn")
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          currentTicket = {
            name:
              button.dataset.ticket,

            price:
              button.dataset.price,
          };

          document
            .querySelector(
              "#selected-ticket"
            )
            .textContent =
            currentTicket.name;

          document
            .querySelector(
              "#selected-price"
            )
            .textContent =
            `KSh ${Number(
              currentTicket.price
            ).toLocaleString()} • 1 ticket`;

          document
            .querySelector(
              "#checkout"
            )
            .scrollIntoView({
              behavior:
                "smooth",

              block:
                "center",
            });

          const toast =
            document
              .querySelector(
                "#toast"
              );

          toast.textContent =
            `${currentTicket.name} selected`;

          toast.classList.add(
            "show"
          );

          setTimeout(
            () => {

              toast.classList.remove(
                "show"
              );

            },
            1800
          );

        }
      );

    });

    
    /* =====================================================
   GATE PASS SELECTION
===================================================== */

document
  .querySelectorAll("[data-gate-ticket]")
  .forEach((card) => {

    card.addEventListener("click", () => {

      const ticketName =
        card.dataset.gateTicket;

      const priceText =
        card.querySelector("strong").textContent;

      const ticketPrice =
        priceText.replace(/[^\d]/g, "");

      currentTicket = {
        name: ticketName,
        price: ticketPrice,
      };

      document
        .querySelector("#selected-ticket")
        .textContent =
        currentTicket.name;

      document
        .querySelector("#selected-price")
        .textContent =
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



  /* =====================================================
     CHECKOUT FORM
  ===================================================== */

  let orderSubmitting = false;

function isAcceptableEmail(email) {
  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!emailPattern.test(email)) {
    return false;
  }

  const domain =
    email.split("@")[1].toLowerCase();

  const blockedDomains = [
    "fake.com",
    "test.com",
    "example.com",
    "mailinator.com",
    "yopmail.com",
    "tempmail.com",
    "10minutemail.com",
  ];

  return !blockedDomains.includes(domain);
}


document
  .querySelector("#ticket-form")
  .addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      if (orderSubmitting) {
        return;
      }

      const toast =
        document.querySelector("#toast");

      const submitButton =
        document.querySelector(
          '#ticket-form button[type="submit"]'
        );

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
        document
          .querySelector("#name")
          .value
          .trim();

      const phone =
        document
          .querySelector("#phone")
          .value
          .trim();

      const email =
        document
          .querySelector("#email")
          .value
          .trim()
          .toLowerCase();


      /* ---------------------------------------------
         EMAIL VALIDATION
      --------------------------------------------- */

      if (!isAcceptableEmail(email)) {
        toast.textContent =
          "Please enter a valid email address.";

        toast.classList.add("show");

        setTimeout(() => {
          toast.classList.remove("show");
        }, 2200);

        return;
      }


      /* ---------------------------------------------
         LOCK SUBMISSION
      --------------------------------------------- */

      orderSubmitting = true;

      submitButton.disabled = true;
      submitButton.textContent =
        "Creating order...";


      try {

        /* ---------------------------------------------
           GET REAL TICKET
        --------------------------------------------- */
      
        const {
          data: ticket,
          error: ticketError,
        } = await supabase
          .from("tickets")
          .select("*")
          .eq("name", currentTicket.name)
          .single();


        if (ticketError || !ticket) {
          console.error(ticketError);

          toast.textContent =
            "Unable to verify ticket.";

          toast.classList.add("show");

          return;
        }


        /* ---------------------------------------------
           CHECK AVAILABILITY
        --------------------------------------------- */

        if (ticket.status !== "active") {
          toast.textContent =
            `${ticket.name} is not currently available.`;

          toast.classList.add("show");

          return;
        }


        /* ---------------------------------------------
           CREATE ONE PENDING ORDER
        --------------------------------------------- */

        const {
          error: orderError,
        } = await supabase
          .from("orders")
          .insert({
            customer_name: name,
            customer_email: email,
            customer_phone: phone,

            ticket_id: ticket.id,
            ticket_name: ticket.name,

            quantity: 1,

            unit_price: ticket.price,
            total_amount: ticket.price,

            payment_status: "pending",
          });


        if (orderError) {
          console.error(orderError);

          toast.textContent =
            "Unable to create order.";

          toast.classList.add("show");

          return;
        }


        toast.textContent =
          "Order created ✓ Complete your M-PESA payment below.";

        toast.classList.add("show");

        /* ---------------------------------------------
           SHOW MANUAL M-PESA PAYMENT INSTRUCTIONS
           --------------------------------------------- */

           let paymentBox =
           document.getElementById("mpesa-payment-box");

           if (!paymentBox) {
           paymentBox = document.createElement("div");
           paymentBox.id = "mpesa-payment-box";
  
           submitButton.insertAdjacentElement(
           "afterend",
           paymentBox
  );
}

paymentBox.innerHTML = `
  <div class="mpesa-payment-card">

    <div class="mpesa-payment-head">
      <span class="mpesa-secure">SECURE M-PESA CHECKOUT</span>

      <h3>Complete your payment</h3>

      <p>
        Pay <strong>TIDEHOUSE LIVE</strong> to confirm your
        Coast Wave ticket.
      </p>
    </div>

    <div class="mpesa-payment-summary">

      <div class="mpesa-payment-detail">
        <span>AMOUNT</span>
        <strong>
          KSh ${Number(ticket.price).toLocaleString()}
        </strong>
      </div>

      <div class="mpesa-payment-detail">
        <span>BUY GOODS TILL</span>
        <strong>1777530</strong>
      </div>

      <div class="mpesa-payment-detail">
        <span>MERCHANT</span>
        <strong>TIDEHOUSE LIVE</strong>
      </div>

    </div>

    <div class="mpesa-payment-steps">
      <span>PAY WITH M-PESA</span>

      <p>
        M-PESA → Lipa na M-PESA → Buy Goods and Services
      </p>

      <p>
        Enter Till <strong>1777530</strong>,
        pay the exact amount above and confirm with your M-PESA PIN.
      </p>
    </div>

    <p class="mpesa-payment-note">
      Keep your M-PESA confirmation message.
      Your QR ticket will be issued after payment verification.
    </p>

  </div>
`;

        /* Prevent another accidental order */
        submitButton.textContent =
          "Order Created ✓";

        document
          .querySelectorAll(".ticket-btn")
          .forEach((button) => {
            button.disabled = true;
          });


        setTimeout(() => {
          toast.classList.remove("show");
        }, 2500);

      } finally {

        /*
          Keep successful order locked.
          Only unlock if an order was not created.
        */

        if (
          submitButton.textContent !==
          "Order Created ✓"
        ) {
          orderSubmitting = false;

          submitButton.disabled = false;

          submitButton.textContent =
            "Continue to M-Pesa";
        }
      }

    }
  );

}
