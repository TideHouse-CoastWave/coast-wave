import { supabase } from "./supabase.js";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";

async function openTicket(ticketCode) {
  try {
    const qrData = `COAST-WAVE-TICKET:${ticketCode}`;

    const qrImage = await QRCode.toDataURL(qrData, {
      width: 320,
      margin: 2,
    });

    const ticketWindow = window.open("", "_blank");

    if (!ticketWindow) {
      alert("Please allow pop-ups to view the ticket.");
      return;
    }

    ticketWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Coast Wave Ticket ${ticketCode}</title>

          <meta name="viewport" content="width=device-width, initial-scale=1.0">

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #07110d;
              font-family: Arial, sans-serif;
              color: white;
              padding: 24px;
            }

            .ticket {
              width: 100%;
              max-width: 420px;
              background: #0d1b15;
              border: 1px solid rgba(255,255,255,0.12);
              border-radius: 24px;
              padding: 32px;
              text-align: center;
            }

            .brand {
              color: #ff571f;
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 3px;
            }

            h1 {
              margin: 10px 0 6px;
              font-size: 34px;
            }

            .edition {
              color: rgba(255,255,255,0.65);
              margin-bottom: 26px;
            }

            .qr {
              background: white;
              padding: 16px;
              border-radius: 18px;
              display: inline-block;
            }

            .qr img {
              width: 230px;
              max-width: 100%;
              display: block;
            }

            .ticket-code {
              margin-top: 22px;
              font-size: 22px;
              font-weight: 900;
              letter-spacing: 2px;
            }

            .event-info {
              margin-top: 24px;
              padding-top: 20px;
              border-top: 1px solid rgba(255,255,255,0.1);
              line-height: 1.8;
              color: rgba(255,255,255,0.8);
            }

            .warning {
              margin-top: 20px;
              font-size: 12px;
              color: rgba(255,255,255,0.5);
            }
          </style>
        </head>

        <body>
          <div class="ticket">

            <div class="brand">
              COAST WAVE
            </div>

            <h1>Your Ticket</h1>

            <div class="edition">
              Edition 001
            </div>

            <div class="qr">
              <img src="${qrImage}" alt="Ticket QR Code">
            </div>

            <div class="ticket-code">
              ${ticketCode}
            </div>

            <div class="event-info">
              <strong>Saturday, 27 March 2027</strong><br>
              Lost Beach • Malindi, Kenya
            </div>

            <div class="warning">
              Present this QR code at the entrance.<br>
              Each ticket can only be checked in once.
            </div>

          </div>
        </body>
      </html>
    `);

    ticketWindow.document.close();
  } catch (error) {
    console.error("Unable to generate ticket:", error);
    alert("Unable to generate ticket.");
  }
}

async function generateTicketQR(ticketCode) {
  if (!ticketCode) return null;

  const ticketUrl = `${window.location.origin}/ticket?code=${encodeURIComponent(
    ticketCode
  )}`;

  return await QRCode.toDataURL(ticketUrl, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: "H",
  });
}
/* =====================================================
   PROTECT ADMIN DASHBOARD
===================================================== */

async function protectAdminDashboard() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    window.location.href = "/admin";
    return false;
  }

  return true;
}


/* =====================================================
   ADMIN LOGIN PAGE
===================================================== */

export async function renderAdmin() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    window.location.href = "/admin/dashboard";
    return;
  }

  document.querySelector("#app").innerHTML = `
    <main class="admin-login">
      <div class="admin-login-card">

        <div class="admin-login-brand">
          <span>COAST WAVE</span>
          <small>ADMIN</small>
        </div>

        <h1>Welcome back.</h1>

        <p>
          Sign in to manage tickets, orders,
          attendees and event operations.
        </p>

        <form id="admin-login-form">

          <label>
            Email

            <input
              type="email"
              id="admin-email"
              placeholder="info@coastwavelive.com"
              autocomplete="email"
              required
            />
          </label>

          <label>
            Password

            <input
              type="password"
              id="admin-password"
              placeholder="Enter password"
              autocomplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            id="admin-login-button"
          >
            Sign In
          </button>

          <p id="admin-login-message"></p>

        </form>

        <small class="admin-security">
          Private Coast Wave management portal
        </small>

      </div>
    </main>
  `;

  const form =
    document.querySelector("#admin-login-form");

  const button =
    document.querySelector("#admin-login-button");

  const message =
    document.querySelector("#admin-login-message");


  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email =
      document
        .querySelector("#admin-email")
        .value
        .trim();

    const password =
      document
        .querySelector("#admin-password")
        .value;

    button.disabled = true;
    button.textContent = "Signing in...";
    message.textContent = "";

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      message.textContent =
        "Invalid email or password.";

      button.disabled = false;
      button.textContent = "Sign In";

      return;
    }

    if (data.user) {
      window.location.href =
        "/admin/dashboard";
    }
  });
}


/* =====================================================
   ADMIN DASHBOARD
===================================================== */

export async function renderAdminDashboard() {
  const authenticated =
    await protectAdminDashboard();

  if (!authenticated) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const adminEmail =
    session?.user?.email ||
    "info@coastwavelive.com";


  document.querySelector("#app").innerHTML = `
    <div class="admin-dashboard">

      <!-- SIDEBAR -->
      <aside class="admin-sidebar">

        <div class="admin-sidebar-brand">
          <strong>COAST WAVE</strong>
          <span>ADMIN</span>
        </div>

        <nav class="admin-menu">

          <button
            class="active"
            data-page="overview"
          >
            Overview
          </button>

          <button data-page="tickets">
            Ticket Sales
          </button>

          <button data-page="orders">
            Orders
          </button>

          <button data-page="attendees">
            Attendees
          </button>

          <button data-page="checkin">
            Check-in
          </button>

          <button data-page="event">
            Event
          </button>

          <button data-page="analytics">
            Analytics
          </button>

          <button data-page="settings">
            Settings
          </button>

        </nav>

        <button
          id="admin-logout"
          class="admin-logout"
        >
          Sign Out
        </button>

      </aside>


      <!-- MAIN -->
      <main
        class="admin-main"
        id="admin-content"
      >
      </main>

    </div>
  `;


  /* =====================================================
     PAGE RENDERERS
  ===================================================== */

  const content =
    document.querySelector("#admin-content");


  async function renderOverview() {

  /* =====================================================
     LOADING STATE
  ===================================================== */

  content.innerHTML = `
    <header class="admin-topbar">

      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Dashboard</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>

    </header>

    <section class="admin-panel">
      <div class="admin-empty">
        Loading dashboard...
      </div>
    </section>
  `;


  /* =====================================================
     LOAD ORDERS
  ===================================================== */

  const { data: orders, error } =
    await supabase
      .from("orders")
      .select("*")
      .order("created_at", {
        ascending: false,
      });


  if (error) {
    console.error(error);

    content.innerHTML = `
      <header class="admin-topbar">

        <div>
          <p>COAST WAVE • EDITION 001</p>
          <h1>Dashboard</h1>
        </div>

        <div class="admin-user">
          ${adminEmail}
        </div>

      </header>

      <section class="admin-panel">
        <div class="admin-empty">
          Unable to load dashboard data.
        </div>
      </section>
    `;

    return;
  }


  /* =====================================================
     ORDER DATA
  ===================================================== */

  const allOrders =
    orders || [];


  const paidOrders =
    allOrders.filter(
      (order) =>
        String(
          order.payment_status || ""
        ).toLowerCase() === "paid"
    );


  /* =====================================================
     REVENUE
  ===================================================== */

  const totalRevenue =
    paidOrders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.total_amount || 0
        ),
      0
    );


  /* =====================================================
     TICKETS SOLD
  ===================================================== */

  const ticketsSold =
    paidOrders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.quantity || 1
        ),
      0
    );


  /* =====================================================
     CHECKED IN
  ===================================================== */

  const checkedIn =
    paidOrders.reduce(
      (sum, order) =>
        sum +
        (
          order.checked_in === true
            ? Number(order.quantity || 1)
            : 0
        ),
      0
    );


  /* =====================================================
     EVENT CAPACITY
  ===================================================== */

  const savedEvent =
    JSON.parse(
      localStorage.getItem(
        "coast-wave-event-settings"
      ) || "null"
    );


  const eventCapacity =
    Number(
      savedEvent?.capacity || 5000
    );


  const remainingCapacity =
    Math.max(
      eventCapacity - ticketsSold,
      0
    );


  /* =====================================================
     TICKET COUNTS
  ===================================================== */

  function getTicketQuantity(name) {

    return paidOrders
      .filter(
        (order) =>
          String(
            order.ticket_name || ""
          ).toLowerCase() ===
          name.toLowerCase()
      )
      .reduce(
        (sum, order) =>
          sum +
          Number(
            order.quantity || 1
          ),
        0
      );
  }


  const superEarlySold =
    getTicketQuantity(
      "Super Early Bird"
    );

  const earlyBirdSold =
    getTicketQuantity(
      "Early Bird"
    );

  const regularSold =
    getTicketQuantity(
      "Regular"
    );

  const vipSold =
    getTicketQuantity(
      "VIP Advance"
    );


  /* =====================================================
     RECENT PAID ORDERS
  ===================================================== */

  const recentPaidOrders =
    paidOrders.slice(0, 5);


  /* =====================================================
     DASHBOARD UI
  ===================================================== */

  content.innerHTML = `
    <header class="admin-topbar">

      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Dashboard</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>

    </header>


    <section class="admin-stats">

      <article>
        <span>Total Revenue</span>

        <strong>
          KSh ${totalRevenue.toLocaleString()}
        </strong>

        <small>
          Paid ticket sales
        </small>
      </article>


      <article>
        <span>Tickets Sold</span>

        <strong>
          ${ticketsSold}
        </strong>

        <small>
          Confirmed tickets
        </small>
      </article>


      <article>
        <span>Checked In</span>

        <strong>
          ${checkedIn}
        </strong>

        <small>
          Event-day entries
        </small>
      </article>


      <article>
        <span>Remaining Capacity</span>

        <strong>
          ${remainingCapacity.toLocaleString()}
        </strong>

        <small>
          Target ${eventCapacity.toLocaleString()}
        </small>
      </article>

    </section>


    <section class="admin-panel">

      <div class="admin-panel-head">

        <div>
          <p>TICKET SALES</p>
          <h2>Sales overview</h2>
        </div>

      </div>


      <div class="admin-ticket-breakdown">

        <div>
          <span>
            Super Early Bird
          </span>

          <strong>
            ${superEarlySold}
          </strong>

          <small>
            KSh 1,500
          </small>
        </div>


        <div>
          <span>
            Early Bird
          </span>

          <strong>
            ${earlyBirdSold}
          </strong>

          <small>
            KSh 2,000
          </small>
        </div>


        <div>
          <span>
            Regular
          </span>

          <strong>
            ${regularSold}
          </strong>

          <small>
            KSh 2,500
          </small>
        </div>


        <div>
          <span>
            VIP Advance
          </span>

          <strong>
            ${vipSold}
          </strong>

          <small>
            KSh 5,000
          </small>
        </div>

      </div>

    </section>


    <section class="admin-panel">

      <div class="admin-panel-head">

        <div>
          <p>RECENT ORDERS</p>
          <h2>Latest purchases</h2>
        </div>

      </div>


      ${
        recentPaidOrders.length === 0
          ? `
            <div class="admin-empty">
              No paid orders yet.
            </div>
          `
          : `
            <div class="admin-orders-table-wrap">

              <table class="admin-orders-table">

                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Ticket</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th>Reference</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>

                  ${recentPaidOrders
                    .map((order) => {

                      const date =
                        order.created_at
                          ? new Date(
                              order.created_at
                            ).toLocaleString()
                          : "-";

                      return `
                        <tr>

                          <td>
                            <strong>
                              ${order.customer_name || "-"}
                            </strong>

                            <small>
                              ${order.customer_email || ""}
                            </small>
                          </td>


                          <td>
                            ${order.ticket_name || "-"}
                          </td>


                          <td>
                            ${order.quantity || 1}
                          </td>


                          <td>
                            KSh ${Number(
                              order.total_amount || 0
                            ).toLocaleString()}
                          </td>


                          <td>
                            ${order.payment_reference || "-"}
                          </td>


                          <td>
                            ${date}
                          </td>

                        </tr>
                      `;
                    })
                    .join("")}

                </tbody>

              </table>

            </div>
          `
      }

    </section>
  `;
}

 async function renderTickets() {
  content.innerHTML = `
    <header class="admin-topbar">
      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Ticket Sales</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>
    </header>

    <section class="admin-panel">
      <div class="admin-empty">
        Loading tickets...
      </div>
    </section>
  `;

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);

    content.innerHTML = `
      <header class="admin-topbar">
        <div>
          <p>COAST WAVE • EDITION 001</p>
          <h1>Ticket Sales</h1>
        </div>

        <div class="admin-user">
          ${adminEmail}
        </div>
      </header>

      <section class="admin-panel">
        <div class="admin-empty">
          Unable to load tickets.
        </div>
      </section>
    `;

    return;
  }

  const onlineTickets =
    tickets.filter(
      (ticket) => ticket.category === "online"
    );

  const gateTickets =
    tickets.filter(
      (ticket) => ticket.category === "gate"
    );


  function ticketCard(ticket) {
    return `
      <div class="admin-ticket-edit-card">

        <div class="admin-ticket-edit-top">
          <div>
            <span>${ticket.name}</span>

            <strong>
              KSh ${Number(
                ticket.price
              ).toLocaleString()}
            </strong>
          </div>

          <span
            class="ticket-status-badge ${ticket.status}"
          >
            ${ticket.status.replace("_", " ")}
          </span>
        </div>


        <div class="admin-ticket-controls">

          <label>
            Price

            <input
              type="number"
              min="0"
              step="50"
              value="${ticket.price}"
              data-price-input="${ticket.id}"
            />
          </label>


          <label>
            Status

            <select
              data-status-input="${ticket.id}"
            >

              <option
                value="active"
                ${
                  ticket.status === "active"
                    ? "selected"
                    : ""
                }
              >
                Active
              </option>

              <option
                value="upcoming"
                ${
                  ticket.status === "upcoming"
                    ? "selected"
                    : ""
                }
              >
                Upcoming
              </option>

              <option
                value="sold_out"
                ${
                  ticket.status === "sold_out"
                    ? "selected"
                    : ""
                }
              >
                Sold Out
              </option>

              <option
                value="disabled"
                ${
                  ticket.status === "disabled"
                    ? "selected"
                    : ""
                }
              >
                Disabled
              </option>

            </select>
          </label>

        </div>


        <button
          class="admin-save-ticket"
          data-save-ticket="${ticket.id}"
        >
          Save Changes
        </button>

        <p
          class="admin-ticket-message"
          id="ticket-message-${ticket.id}"
        ></p>

      </div>
    `;
  }


  content.innerHTML = `
    <header class="admin-topbar">

      <div>
        <p>
          COAST WAVE • EDITION 001
        </p>

        <h1>
          Ticket Sales
        </h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>

    </header>


    <section class="admin-panel">

      <div class="admin-panel-head">

        <div>
          <p>
            ONLINE TICKETS
          </p>

          <h2>
            Ticket releases
          </h2>
        </div>

      </div>


      <div class="admin-ticket-edit-grid">

        ${onlineTickets
          .map(ticketCard)
          .join("")}

      </div>

    </section>


    <section class="admin-panel">

      <div class="admin-panel-head">

        <div>
          <p>
            EVENT DAY
          </p>

          <h2>
            Gate pricing
          </h2>
        </div>

      </div>


      <div class="admin-ticket-edit-grid">

        ${gateTickets
          .map(ticketCard)
          .join("")}

      </div>

    </section>
  `;


  /* =====================================================
     SAVE TICKET CHANGES
  ===================================================== */

  document
    .querySelectorAll(
      "[data-save-ticket]"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        async () => {

          const ticketId =
            button.dataset.saveTicket;

          const priceInput =
            document.querySelector(
              `[data-price-input="${ticketId}"]`
            );

          const statusInput =
            document.querySelector(
              `[data-status-input="${ticketId}"]`
            );

          const message =
            document.querySelector(
              `#ticket-message-${ticketId}`
            );

          const price =
            Number(priceInput.value);

          const status =
            statusInput.value;


          if (
            !Number.isFinite(price) ||
            price < 0
          ) {
            message.textContent =
              "Enter a valid price.";

            return;
          }


          button.disabled = true;
          button.textContent =
            "Saving...";

          message.textContent = "";


          const { error } =
            await supabase
              .from("tickets")
              .update({
                price,
                status,
              })
              .eq("id", ticketId);


          if (error) {
            console.error(error);

            message.textContent =
              "Unable to save changes.";

            button.disabled = false;
            button.textContent =
              "Save Changes";

            return;
          }


          message.textContent =
            "Saved successfully.";

          button.textContent =
            "Saved ✓";


          setTimeout(
            () => {
              renderTickets();
            },
            700
          );

        }
      );

    });
}


  async function renderOrders() {
  content.innerHTML = `
    <header class="admin-topbar">
      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Orders</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>
    </header>

    <section class="admin-panel">
      <div class="admin-empty">
        Loading orders...
      </div>
    </section>
  `;

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

    const confirmPayment = async (orderId) => {
  const paymentReference = prompt(
    "Enter the customer's M-PESA transaction code:"
  );

  if (!paymentReference || !paymentReference.trim()) {
    return;
  }

  const confirmed = confirm(
    `Confirm payment?\n\nM-PESA Code: ${paymentReference.trim().toUpperCase()}`
  );

  if (!confirmed) {
    return;
  }

  const { data, error } = await supabase.rpc(
    "confirm_payment_and_issue_ticket",
    {
      p_order_id: orderId,
      p_payment_reference: paymentReference.trim().toUpperCase(),
      p_payment_method: "Manual M-PESA",
      p_verified_by: adminEmail
    }
  );

  if (error) {
    console.error("Payment confirmation failed:", error);
    alert(`Payment confirmation failed: ${error.message}`);
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;

  alert(
    `Payment confirmed successfully.\n\nTicket: ${
      result?.ticket_code || "Generated"
    }`
  );

  await renderOrders();
};
  

  if (error) {
    console.error(error);

    content.innerHTML = `
      <header class="admin-topbar">
        <div>
          <p>COAST WAVE • EDITION 001</p>
          <h1>Orders</h1>
        </div>

        <div class="admin-user">
          ${adminEmail}
        </div>
      </header>

      <section class="admin-panel">
        <div class="admin-empty">
          Unable to load orders.
        </div>
      </section>
    `;

    return;
  }

  if (!orders || orders.length === 0) {
    content.innerHTML = `
      <header class="admin-topbar">
        <div>
          <p>COAST WAVE • EDITION 001</p>
          <h1>Orders</h1>
        </div>

        <div class="admin-user">
          ${adminEmail}
        </div>
      </header>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <div>
            <p>ORDERS</p>
            <h2>Ticket purchases</h2>
          </div>
        </div>

        <div class="admin-empty">
          No orders yet.
        </div>
      </section>
    `;

    return;
  }

  content.innerHTML = `
    <header class="admin-topbar">
      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Orders</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>
    </header>

    <section class="admin-panel">

      <div class="admin-panel-head">
        <div>
          <p>ORDERS</p>
          <h2>Ticket purchases</h2>
        </div>
      </div>

      <div class="admin-orders-table-wrap">

        <table class="admin-orders-table">

          <thead>
            <tr>
              <th>Customer</th>
              <th>Ticket</th>
              <th>Qty</th>
              <th>Total</th>
              <th>Status</th>
              <th>Action</th>
              <th>Reference</th>
              <th>Date</th>
            </tr>
          </thead>

          <tbody>

            ${orders
              .map((order) => {
                const date =
                  order.created_at
                    ? new Date(order.created_at).toLocaleString()
                    : "-";

                const status =
                  order.payment_status || "pending";

                return `
                  <tr>
                    <td>
                      <strong>
                        ${order.customer_name || "-"}
                      </strong>

                      <small>
                        ${order.customer_email || ""}
                      </small>

                      <small>
                        ${order.customer_phone || ""}
                      </small>
                    </td>

                    <td>
                      ${order.ticket_name || "-"}
                    </td>

                    <td>
                      ${order.quantity || 1}
                    </td>

                    <td>
                      KSh ${Number(
                        order.total_amount || 0
                      ).toLocaleString()}
                    </td>

                    <td>
                      <span class="order-status ${status}">
                        ${status.replaceAll("_", " ")}
                      </span>
                    </td>

                    <td>
                      ${order.payment_reference || "-"}
                    </td>

                    <td>
                      ${date}
                    </td>

                    <td>
  ${
    status.toLowerCase() === "pending"
      ? `<button
           class="btn btn-primary confirm-payment-btn"
           data-order-id="${order.id}"
         >
           Confirm M-PESA
         </button>`
      : order.ticket_code
        ? `<button
     class="btn view-ticket-btn"
     data-order-id="${order.id}"
     data-ticket-code="${order.ticket_code}"
   >
     View Ticket
   </button>`
        : "Paid"
  }
</td>

                  </tr>
                `;
              })
              .join("")}

          </tbody>

        </table>

      </div>

    </section>
   `;

  document.querySelectorAll(".view-ticket-btn").forEach((button) => {
  button.onclick = async () => {
    const ticketCode = button.dataset.ticketCode;

    console.log("View Ticket clicked:", ticketCode);

    if (!ticketCode) {
      alert("Ticket code not found.");
      return;
    }

    await openTicket(ticketCode);
  };
});

} 


/* =====================================================
   ATTENDEES
===================================================== */

async function renderAttendees() {
  content.innerHTML = `
    <header class="admin-topbar">
      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Attendees</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>
    </header>

    <section class="admin-panel">
      <div class="admin-empty">
        Loading attendees...
      </div>
    </section>

  `;

  const { data: orders, error } =
    await supabase
      .from("orders")
      .select("*")
      .eq("payment_status", "Paid")
      .order("created_at", {
        ascending: false,
      });


  if (error) {
    console.error(error);

    content.innerHTML = `
      <header class="admin-topbar">
        <div>
          <p>COAST WAVE • EDITION 001</p>
          <h1>Attendees</h1>
        </div>

        <div class="admin-user">
          ${adminEmail}
        </div>
      </header>

      <section class="admin-panel">
        <div class="admin-empty">
          Unable to load attendees.
        </div>
      </section>
    `;

    return;
  }


  if (!orders || orders.length === 0) {
    content.innerHTML = `
      <header class="admin-topbar">
        <div>
          <p>COAST WAVE • EDITION 001</p>
          <h1>Attendees</h1>
        </div>

        <div class="admin-user">
          ${adminEmail}
        </div>
      </header>

      <section class="admin-panel">

        <div class="admin-panel-head">
          <div>
            <p>ATTENDEES</p>
            <h2>Guest list</h2>
          </div>
        </div>

        <div class="admin-empty">
          No paid attendees yet.
        </div>

      </section>
    `;

    return;
  }


  content.innerHTML = `
    <header class="admin-topbar">
      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Attendees</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>
    </header>


    <section class="admin-stats">

      <article>
        <span>Total Attendees</span>
        <strong>${orders.length}</strong>
        <small>Paid guests</small>
      </article>

      <article>
        <span>VIP Guests</span>
        <strong>
          ${
            orders.filter(
              (order) =>
                order.ticket_name
                  ?.toLowerCase()
                  .includes("vip")
            ).length
          }
        </strong>
        <small>Premium access</small>
      </article>

      <article>
        <span>General Guests</span>
        <strong>
          ${
            orders.filter(
              (order) =>
                !order.ticket_name
                  ?.toLowerCase()
                  .includes("vip")
            ).length
          }
        </strong>
        <small>Standard access</small>
      </article>

      <article>
        <span>Event Capacity</span>
        <strong>5,000</strong>
        <small>Maximum target</small>
      </article>

    </section>


    <section class="admin-panel">

      <div class="admin-panel-head">
        <div>
          <p>ATTENDEES</p>
          <h2>Guest list</h2>
        </div>
      </div>


      <div class="admin-orders-table-wrap">

        <table class="admin-orders-table">

          <thead>
            <tr>
           <th>Customer</th>
           <th>Ticket</th>
           <th>Qty</th>
           <th>Total</th>
           <th>Status</th>
           <th>Reference</th>
           <th>Date</th>
           <th>Action</th>
            </tr>
          </thead>

          <tbody>

            ${orders
              .map((order) => {

                const date =
                  order.created_at
                    ? new Date(
                        order.created_at
                      ).toLocaleString()
                    : "-";

                return `
                  <tr>
                    <td>
                      <strong>
                        ${order.customer_name || "-"}
                      </strong>
                    </td>

                    <td>
                      ${order.customer_email || "-"}
                    </td>

                    <td>
                      ${order.customer_phone || "-"}
                    </td>

                    <td>
                      ${order.ticket_name || "-"}
                    </td>

                    <td>
                      ${order.quantity || 1}
                    </td>

                    <td>
                      <span class="order-status paid">
                        paid
                      </span>
                    </td>

                    <td>
                      ${date}
                    </td>
                  </tr>
                `;
              })
              .join("")}

          </tbody>

        </table>

      </div>

    </section>
  `;
}


/* =====================================================
   CHECK-IN
===================================================== */

async function renderCheckin() {
  content.innerHTML = `
    <header class="admin-topbar">
      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Check-in</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>
    </header>

    <section class="admin-panel">
      <div class="admin-empty">
        Loading valid tickets...
      </div>
    </section>
  `;


  const { data: orders, error } =
    await supabase
      .from("orders")
      .select("*")
      .eq("payment_status", "Paid")
      .order("created_at", {
        ascending: false,
      });


  if (error) {
    console.error(error);

    content.innerHTML = `
      <header class="admin-topbar">
        <div>
          <p>COAST WAVE • EDITION 001</p>
          <h1>Check-in</h1>
        </div>

        <div class="admin-user">
          ${adminEmail}
        </div>
      </header>

      <section class="admin-panel">
        <div class="admin-empty">
          Unable to load valid tickets.
        </div>
      </section>
    `;

    return;
  }


  content.innerHTML = `
    <header class="admin-topbar">

      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Check-in</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>

    </header>


    <section class="admin-stats">

      <article>
        <span>Paid Tickets</span>
        <strong>
          ${(orders || []).length}
        </strong>
        <small>Valid for entry</small>
      </article>

      <article>
        <span>Checked In</span>
        <strong>
          ${
            (orders || []).filter(
              (order) =>
                order.checked_in === true
            ).length
          }
        </strong>
        <small>Guests entered</small>
      </article>

      <article>
        <span>Waiting</span>
        <strong>
          ${
            (orders || []).filter(
              (order) =>
                order.checked_in !== true
            ).length
          }
        </strong>
        <small>Not yet entered</small>
      </article>

      <article>
        <span>Capacity</span>
        <strong>5,000</strong>
        <small>Event target</small>
      </article>

    </section>


    <section class="admin-panel">

      <div class="admin-panel-head">
        <div>
          <p>GATE CONTROL</p>
          <h2>Ticket verification</h2>
        </div>
      </div>


      <div class="admin-ticket-controls">

  <label>
    Search guest

    <input
      type="text"
      id="checkin-search"
      placeholder="Name, email, phone, reference or ticket code"
    />
  </label>

  <button
    type="button"
    class="admin-save-ticket"
    id="start-qr-scanner"
  >
    Scan QR Ticket
  </button>

  <div
    id="qr-reader"
    style="width: 100%; max-width: 420px; margin-top: 16px;"
  ></div>

  <p
    class="admin-ticket-message"
    id="qr-checkin-message"
  ></p>

</div>


      <div
        class="admin-orders-table-wrap"
        id="checkin-results"
      >
      </div>

    </section>
  `;


  const results =
    document.querySelector(
      "#checkin-results"
    );

  const search =
    document.querySelector(
      "#checkin-search"
    );

    const scanButton =
  document.querySelector(
    "#start-qr-scanner"
  );

const qrMessage =
  document.querySelector(
    "#qr-checkin-message"
  );

let qrScanner = null;

scanButton.addEventListener("click", async () => {
  try {
    qrMessage.textContent = "Starting camera...";

    if (!qrScanner) {
      qrScanner = new Html5Qrcode("qr-reader");
    }

    await qrScanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: {
          width: 250,
          height: 250,
        },
      },
      async (decodedText) => {
        

        qrMessage.innerHTML = `
  <div class="scan-success-card">
    <div class="scan-success-icon">✓</div>

    <div class="scan-success-info">
      <strong>TICKET DETECTED</strong>
      <span>${decodedText}</span>
    </div>
  </div>
`;
      },
      () => {
        // Ignore normal scan misses.
      }
    );

    scanButton.disabled = true;
    scanButton.textContent = "Scanner Active";

    qrMessage.textContent =
      "Camera ready. Point it at a Coast Wave ticket QR.";
  } catch (error) {
    console.error("QR scanner error:", error);

    qrMessage.textContent =
      "Unable to start camera. Please allow camera access.";
  }
});
  


  function drawCheckinRows(list) {

    if (!list || list.length === 0) {
      results.innerHTML = `
        <div class="admin-empty">
          No matching paid ticket found.
        </div>
      `;

      return;
    }


    results.innerHTML = `
      <table class="admin-orders-table">

        <thead>
          <tr>
            <th>Guest</th>
            <th>Ticket</th>
            <th>Reference</th>
            <th>Payment</th>
            <th>Check-in</th>
          </tr>
        </thead>

        <tbody>

          ${list
            .map((order) => {

              const checkedIn =
                order.checked_in === true;

              const checkedAt =
                order.checked_in_at
                  ? new Date(
                      order.checked_in_at
                    ).toLocaleString()
                  : "";

              return `
                <tr>

                  <td>
                    <strong>
                      ${order.customer_name || "-"}
                    </strong>

                    <small>
                      ${order.customer_phone || ""}
                    </small>

                    <small>
                      ${order.customer_email || ""}
                    </small>
                  </td>


                  <td>
                    ${order.ticket_name || "-"}
                  </td>


                  <td>
                    ${order.payment_reference || "-"}
                  </td>


                  <td>
                    <span class="order-status paid">
                      paid
                    </span>
                  </td>


                  <td>

                    ${
                      checkedIn
                        ? `
                          <span class="order-status paid">
                            Checked In ✓
                          </span>

                          <small>
                            ${checkedAt}
                          </small>
                        `
                        : `
                          <button
                            class="admin-save-ticket"
                            data-checkin="${order.id}"
                          >
                            Check In
                          </button>

                          <p
                            class="admin-ticket-message"
                            id="checkin-message-${order.id}"
                          ></p>
                        `
                    }

                  </td>

                </tr>
              `;
            })
            .join("")}

        </tbody>

      </table>
    `;


    document
      .querySelectorAll(
        "[data-checkin]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            const orderId =
              button.dataset.checkin;

            const message =
              document.querySelector(
                `#checkin-message-${orderId}`
              );


            button.disabled = true;

            button.textContent =
              "Checking in...";

            message.textContent = "";


            const now =
              new Date().toISOString();


            const { error } =
              await supabase
                .from("orders")
                .update({
                  checked_in: true,
                  checked_in_at: now,
                })
                .eq("id", orderId);


            if (error) {
              console.error(error);

              message.textContent =
                "Unable to check in.";

              button.disabled = false;

              button.textContent =
                "Check In";

              return;
            }


            const order =
              orders.find(
                (item) =>
                  item.id === orderId
              );


            if (order) {
              order.checked_in = true;
              order.checked_in_at = now;
            }


            button.textContent =
              "Checked In ✓";


            setTimeout(
              async () => {
                await renderCheckin();
              },
              500
            );

          }
        );

      });
  }


  drawCheckinRows(orders || []);


  search.addEventListener("input", function () {
  const value =
    this.value.trim().toLowerCase();

  const filtered =
    (orders || []).filter((order) => {
      const name =
        (order.customer_name || "").toLowerCase();

      const email =
        (order.customer_email || "").toLowerCase();

      const phone =
        (order.customer_phone || "").toLowerCase();

      const reference =
        (order.payment_reference || "").toLowerCase();

      const ticket =
        (order.ticket_name || "").toLowerCase();

      return (
        name.includes(value) ||
        email.includes(value) ||
        phone.includes(value) ||
        reference.includes(value) ||
        ticket.includes(value)
      );
    });

  drawCheckinRows(filtered);
});
}


/* =====================================================
   EVENT
===================================================== */

function renderEvent() {
  const savedEvent =
    JSON.parse(
      localStorage.getItem("coast-wave-event-settings") ||
        "null"
    ) || {
      eventName: "Coast Wave Edition 001",
      edition: "001",
      date: "2027-03-27",
      openingTime: "15:00",
      city: "Malindi",
      country: "Kenya",
      venue: "Lost Beach, Malindi",
      capacity: 5000,
      status: "Active",
    };


  content.innerHTML = `
    <header class="admin-topbar">

      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Event</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>

    </header>


    <section class="admin-panel">

      <div class="admin-panel-head">
        <div>
          <p>EVENT MANAGEMENT</p>
          <h2>Edit event details</h2>
        </div>
      </div>


      <form
        id="event-settings-form"
        class="admin-event-form"
      >

        <div class="admin-event-form-grid">

          <label class="admin-event-field">
            Event Name

            <input
              type="text"
              id="event-name"
              value="${savedEvent.eventName}"
              required
            />
          </label>


          <label class="admin-event-field">
            Edition

            <input
              type="text"
              id="event-edition"
              value="${savedEvent.edition}"
              required
            />
          </label>


          <label class="admin-event-field">
            Event Date

            <input
              type="date"
              id="event-date"
              value="${savedEvent.date}"
              required
            />
          </label>


          <label class="admin-event-field">
            Opening Time

            <input
              type="time"
              id="event-opening-time"
              value="${savedEvent.openingTime}"
              required
            />
          </label>


          <label class="admin-event-field">
            City

            <input
              type="text"
              id="event-city"
              value="${savedEvent.city}"
              required
            />
          </label>


          <label class="admin-event-field">
            Country

            <input
              type="text"
              id="event-country"
              value="${savedEvent.country}"
              required
            />
          </label>


          <label class="admin-event-field">
            Venue

            <input
              type="text"
              id="event-venue"
              value="${savedEvent.venue}"
              placeholder="Beach venue"
              required
            />
          </label>


          <label class="admin-event-field">
            Target Capacity

            <input
              type="number"
              id="event-capacity"
              min="1"
              value="${savedEvent.capacity}"
              required
            />
          </label>


          <label class="admin-event-field">
            Planning Status

            <select id="event-status">

              <option
                value="Planning"
                ${
                  savedEvent.status === "Planning"
                    ? "selected"
                    : ""
                }
              >
                Planning
              </option>

              <option
                value="Active"
                ${
                  savedEvent.status === "Active"
                    ? "selected"
                    : ""
                }
              >
                Active
              </option>

              <option
                value="Paused"
                ${
                  savedEvent.status === "Paused"
                    ? "selected"
                    : ""
                }
              >
                Paused
              </option>

              <option
                value="Completed"
                ${
                  savedEvent.status === "Completed"
                    ? "selected"
                    : ""
                }
              >
                Completed
              </option>

            </select>
          </label>

        </div>


        <button
          type="submit"
          class="admin-save-ticket"
          id="save-event-settings"
        >
          Save Event Settings
        </button>

        <p
          class="admin-ticket-message"
          id="event-settings-message"
        ></p>

      </form>

    </section>


    <section class="admin-panel">

      <div class="admin-panel-head">
        <div>
          <p>EVENT OVERVIEW</p>
          <h2>${savedEvent.eventName}</h2>
        </div>
      </div>


      <div class="admin-ticket-breakdown">

        <div>
          <span>Event Date</span>

          <strong>
            ${new Date(
              `${savedEvent.date}T12:00:00`
            ).toLocaleDateString(
              "en-GB",
              {
                day: "numeric",
                month: "short",
                year: "numeric",
              }
            )}
          </strong>

          <small>
            ${
              new Date(
                `${savedEvent.date}T12:00:00`
              ).toLocaleDateString(
                "en-US",
                {
                  weekday: "long",
                }
              )
            }
          </small>
        </div>


        <div>
          <span>Opening Time</span>

          <strong>
            ${formatEventTime(
              savedEvent.openingTime
            )}
          </strong>

          <small>Until late</small>
        </div>


        <div>
          <span>Location</span>

          <strong>
            ${savedEvent.city}
          </strong>

          <small>
            ${savedEvent.country}
          </small>
        </div>


        <div>
          <span>Target Capacity</span>

          <strong>
            ${Number(
              savedEvent.capacity
            ).toLocaleString()}
          </strong>

          <small>Guests</small>
        </div>

      </div>

    </section>


    <section class="admin-panel">

      <div class="admin-panel-head">
        <div>
          <p>EVENT STATUS</p>
          <h2>Current setup</h2>
        </div>
      </div>


      <div class="admin-ticket-breakdown">

        <div>
          <span>Edition</span>

          <strong>
            ${savedEvent.edition}
          </strong>

          <small>Coast Wave</small>
        </div>


        <div>
          <span>City</span>

          <strong>
            ${savedEvent.city}
          </strong>

          <small>
            ${savedEvent.country}
          </small>
        </div>


        <div>
          <span>Venue</span>

          <strong>
            ${savedEvent.venue}
          </strong>

          <small>
            ${
              savedEvent.venue === "TBA"
                ? "Announcement pending"
                : "Confirmed venue"
            }
          </small>
        </div>


        <div>
          <span>Planning Status</span>

          <strong>
            ${savedEvent.status}
          </strong>

          <small>Event preparation</small>
        </div>

      </div>

    </section>
  `;


  function formatEventTime(time) {
    if (!time) return "-";

    const [hours, minutes] =
      time.split(":");

    const date =
      new Date();

    date.setHours(
      Number(hours),
      Number(minutes),
      0
    );

    return date.toLocaleTimeString(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
      }
    );
  }


  const form =
    document.querySelector(
      "#event-settings-form"
    );

  const message =
    document.querySelector(
      "#event-settings-message"
    );

  const saveButton =
    document.querySelector(
      "#save-event-settings"
    );


  form.addEventListener(
    "submit",
    (event) => {

      event.preventDefault();


      const eventSettings = {
        eventName:
          document
            .querySelector("#event-name")
            .value
            .trim(),

        edition:
          document
            .querySelector("#event-edition")
            .value
            .trim(),

        date:
          document
            .querySelector("#event-date")
            .value,

        openingTime:
          document
            .querySelector(
              "#event-opening-time"
            )
            .value,

        city:
          document
            .querySelector("#event-city")
            .value
            .trim(),

        country:
          document
            .querySelector("#event-country")
            .value
            .trim(),

        venue:
          document
            .querySelector("#event-venue")
            .value
            .trim(),

        capacity:
          Number(
            document
              .querySelector(
                "#event-capacity"
              )
              .value
          ),

        status:
          document
            .querySelector("#event-status")
            .value,
      };


      if (
        !eventSettings.eventName ||
        !eventSettings.date ||
        !eventSettings.city ||
        !eventSettings.venue ||
        !eventSettings.capacity
      ) {
        message.textContent =
          "Please complete all event fields.";

        return;
      }


      saveButton.disabled = true;

      saveButton.textContent =
        "Saving...";


      localStorage.setItem(
        "coast-wave-event-settings",
        JSON.stringify(eventSettings)
      );


      message.textContent =
        "Event settings saved successfully.";

      saveButton.textContent =
        "Saved ✓";


      setTimeout(
        () => {
          renderEvent();
        },
        700
      );

    }
  );
}

/* =====================================================
   ANALYTICS
===================================================== */

async function renderAnalytics() {

  /* =====================================================
     LOADING STATE
  ===================================================== */

  content.innerHTML = `
    <header class="admin-topbar">

      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Analytics</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>

    </header>


    <section class="admin-panel">

      <div class="admin-empty">
        Loading analytics...
      </div>

    </section>
  `;


  /* =====================================================
     LOAD ORDERS
  ===================================================== */

  const { data: orders, error } =
    await supabase
      .from("orders")
      .select("*");


  if (error) {

    console.error(error);

    content.innerHTML = `
      <header class="admin-topbar">

        <div>
          <p>COAST WAVE • EDITION 001</p>
          <h1>Analytics</h1>
        </div>

        <div class="admin-user">
          ${adminEmail}
        </div>

      </header>


      <section class="admin-panel">

        <div class="admin-empty">
          Unable to load analytics.
        </div>

      </section>
    `;

    return;
  }


  /* =====================================================
     ORDER DATA
  ===================================================== */

  const allOrders =
    orders || [];


  const paidOrders =
    allOrders.filter(
      (order) =>
        String(
          order.payment_status || ""
        ).toLowerCase() === "paid"
    );


  const pendingOrders =
    allOrders.filter(
      (order) =>
        String(
          order.payment_status || ""
        ).toLowerCase() === "pending"
    );


  /* =====================================================
     TOTAL REVENUE
  ===================================================== */

  const revenue =
    paidOrders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.total_amount || 0
        ),
      0
    );


  /* =====================================================
     TICKETS SOLD
  ===================================================== */

  const ticketsSold =
    paidOrders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.quantity || 1
        ),
      0
    );


  /* =====================================================
     CHECKED IN
  ===================================================== */

  const checkedIn =
    paidOrders.filter(
      (order) =>
        order.checked_in === true
    ).length;


  /* =====================================================
     CONVERSION RATE
  ===================================================== */

  const conversion =
    allOrders.length > 0
      ? Math.round(
          (
            paidOrders.length /
            allOrders.length
          ) * 100
        )
      : 0;


  /* =====================================================
     EVENT CAPACITY
  ===================================================== */

  const savedEvent =
    JSON.parse(
      localStorage.getItem(
        "coast-wave-event-settings"
      ) || "null"
    );


  const eventCapacity =
    Number(
      savedEvent?.capacity || 5000
    );


  const capacityRemaining =
    Math.max(
      eventCapacity - ticketsSold,
      0
    );


  /* =====================================================
     TICKET HELPERS
  ===================================================== */

  function ticketQuantity(name) {

    return paidOrders
      .filter(
        (order) =>
          (order.ticket_name || "")
            .toLowerCase() ===
          name.toLowerCase()
      )
      .reduce(
        (sum, order) =>
          sum +
          Number(
            order.quantity || 1
          ),
        0
      );

  }


  function ticketRevenue(name) {

    return paidOrders
      .filter(
        (order) =>
          (order.ticket_name || "")
            .toLowerCase() ===
          name.toLowerCase()
      )
      .reduce(
        (sum, order) =>
          sum +
          Number(
            order.total_amount || 0
          ),
        0
      );

  }


  /* =====================================================
     TICKET COUNTS
  ===================================================== */

  const superEarlySold =
    ticketQuantity(
      "Super Early Bird"
    );

  const earlyBirdSold =
    ticketQuantity(
      "Early Bird"
    );

  const regularSold =
    ticketQuantity(
      "Regular"
    );

  const vipSold =
    ticketQuantity(
      "VIP Advance"
    );


  /* =====================================================
     TICKET REVENUE
  ===================================================== */

  const superEarlyRevenue =
    ticketRevenue(
      "Super Early Bird"
    );

  const earlyBirdRevenue =
    ticketRevenue(
      "Early Bird"
    );

  const regularRevenue =
    ticketRevenue(
      "Regular"
    );

  const vipRevenue =
    ticketRevenue(
      "VIP Advance"
    );


  /* =====================================================
     ANALYTICS UI
  ===================================================== */

  content.innerHTML = `
    <header class="admin-topbar">

      <div>
        <p>COAST WAVE • EDITION 001</p>
        <h1>Analytics</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>

    </header>


    <!-- TOP STATS -->

    <section class="admin-stats">

      <article>

        <span>Revenue</span>

        <strong>
          KSh ${revenue.toLocaleString()}
        </strong>

        <small>
          Paid orders
        </small>

      </article>


      <article>

        <span>Tickets Sold</span>

        <strong>
          ${ticketsSold}
        </strong>

        <small>
          Confirmed tickets
        </small>

      </article>


      <article>

        <span>Pending Orders</span>

        <strong>
          ${pendingOrders.length}
        </strong>

        <small>
          Awaiting payment
        </small>

      </article>


      <article>

        <span>Conversion</span>

        <strong>
          ${conversion}%
        </strong>

        <small>
          Paid vs total orders
        </small>

      </article>

    </section>


    <!-- SALES SNAPSHOT -->

    <section class="admin-panel">

      <div class="admin-panel-head">

        <div>

          <p>PERFORMANCE</p>

          <h2>
            Sales snapshot
          </h2>

        </div>

      </div>


      <div class="admin-ticket-breakdown">

        <div>

          <span>
            Total Orders
          </span>

          <strong>
            ${allOrders.length}
          </strong>

          <small>
            All checkout attempts
          </small>

        </div>


        <div>

          <span>
            Paid Orders
          </span>

          <strong>
            ${paidOrders.length}
          </strong>

          <small>
            Successful payments
          </small>

        </div>


        <div>

          <span>
            Checked In
          </span>

          <strong>
            ${checkedIn}
          </strong>

          <small>
            Guests entered
          </small>

        </div>


        <div>

          <span>
            Capacity Remaining
          </span>

          <strong>
            ${capacityRemaining.toLocaleString()}
          </strong>

          <small>
            Target capacity
            ${eventCapacity.toLocaleString()}
          </small>

        </div>

      </div>

    </section>


    <!-- TICKET SALES BREAKDOWN -->

    <section class="admin-panel">

      <div class="admin-panel-head">

        <div>

          <p>TICKET PERFORMANCE</p>

          <h2>
            Tickets sold by release
          </h2>

        </div>

      </div>


      <div class="admin-ticket-breakdown">

        <div>

          <span>
            Super Early Bird
          </span>

          <strong>
            ${superEarlySold}
          </strong>

          <small>
            Tickets sold
          </small>

        </div>


        <div>

          <span>
            Early Bird
          </span>

          <strong>
            ${earlyBirdSold}
          </strong>

          <small>
            Tickets sold
          </small>

        </div>


        <div>

          <span>
            Regular
          </span>

          <strong>
            ${regularSold}
          </strong>

          <small>
            Tickets sold
          </small>

        </div>


        <div>

          <span>
            VIP Advance
          </span>

          <strong>
            ${vipSold}
          </strong>

          <small>
            Premium tickets
          </small>

        </div>

      </div>

    </section>


    <!-- REVENUE BREAKDOWN -->

    <section class="admin-panel">

      <div class="admin-panel-head">

        <div>

          <p>REVENUE</p>

          <h2>
            Revenue by ticket
          </h2>

        </div>

      </div>


      <div class="admin-ticket-breakdown">

        <div>

          <span>
            Super Early Bird
          </span>

          <strong>
            KSh
            ${superEarlyRevenue.toLocaleString()}
          </strong>

          <small>
            Paid revenue
          </small>

        </div>


        <div>

          <span>
            Early Bird
          </span>

          <strong>
            KSh
            ${earlyBirdRevenue.toLocaleString()}
          </strong>

          <small>
            Paid revenue
          </small>

        </div>


        <div>

          <span>
            Regular
          </span>

          <strong>
            KSh
            ${regularRevenue.toLocaleString()}
          </strong>

          <small>
            Paid revenue
          </small>

        </div>


        <div>

          <span>
            VIP Advance
          </span>

          <strong>
            KSh
            ${vipRevenue.toLocaleString()}
          </strong>

          <small>
            Paid revenue
          </small>

        </div>

      </div>

    </section>
  `;
}

/* =====================================================
   SETTINGS
===================================================== */

function renderSettings() {

  const savedSettings =
    JSON.parse(
      localStorage.getItem("coast-wave-admin-settings") ||
      "null"
    ) || {
      adminName: "Coast Wave Admin",
      publicEmail: "info@coastwavelive.com",
      supportPhone: "",
      whatsapp: "",
      currency: "KES",
      ticketSales: "open",
      checkinEnabled: "enabled",
      maintenanceMode: "off",
      footerNote: "Coast Wave • Malindi, Kenya",
    };


  const savedEvent =
    JSON.parse(
      localStorage.getItem("coast-wave-event-settings") ||
      "null"
    ) || {
      edition: "001",
      city: "Malindi",
      date: "2027-03-27",
    };


  content.innerHTML = `
    <header class="admin-topbar">

      <div>
        <p>COAST WAVE • EDITION ${savedEvent.edition}</p>
        <h1>Settings</h1>
      </div>

      <div class="admin-user">
        ${adminEmail}
      </div>

    </header>


    <!-- STATUS -->

    <section class="admin-panel">

      <div class="admin-panel-head">
        <div>
          <p>ADMIN SETTINGS</p>
          <h2>Management portal</h2>
        </div>
      </div>


      <div class="admin-ticket-breakdown">

        <div>
          <span>Admin Account</span>

          <strong>
            Active
          </strong>

          <small>
            ${adminEmail}
          </small>
        </div>


        <div>
          <span>Database</span>

          <strong>
            Connected
          </strong>

          <small>
            Supabase
          </small>
        </div>


        <div>
          <span>M-Pesa</span>

          <strong>
            Pending
          </strong>

          <small>
            Integration scheduled next
          </small>
        </div>


        <div>
          <span>Event</span>

          <strong>
            Edition ${savedEvent.edition}
          </strong>

          <small>
            ${savedEvent.city}
          </small>
        </div>

      </div>

    </section>


    <!-- EDITABLE SETTINGS -->

    <section class="admin-panel admin-settings-editor">

      <div class="admin-panel-head">

        <div>
          <p>GENERAL SETTINGS</p>
          <h2>Portal configuration</h2>
        </div>

      </div>


      <form
        id="admin-settings-form"
        class="admin-settings-form"
      >

        <label class="admin-settings-field">
          Admin Display Name

          <input
            type="text"
            id="settings-admin-name"
            value="${savedSettings.adminName}"
          />
        </label>


        <label class="admin-settings-field">
          Public Contact Email

          <input
            type="email"
            id="settings-public-email"
            value="${savedSettings.publicEmail}"
          />
        </label>


        <label class="admin-settings-field">
          Support Phone

          <input
            type="tel"
            id="settings-support-phone"
            value="${savedSettings.supportPhone}"
            placeholder="+254..."
          />
        </label>


        <label class="admin-settings-field">
          WhatsApp Number

          <input
            type="tel"
            id="settings-whatsapp"
            value="${savedSettings.whatsapp}"
            placeholder="+254..."
          />
        </label>


        <label class="admin-settings-field">
          Currency

          <select id="settings-currency">

            <option
              value="KES"
              ${
                savedSettings.currency === "KES"
                  ? "selected"
                  : ""
              }
            >
              KES — Kenyan Shilling
            </option>

            <option
              value="USD"
              ${
                savedSettings.currency === "USD"
                  ? "selected"
                  : ""
              }
            >
              USD — US Dollar
            </option>

          </select>
        </label>


        <label class="admin-settings-field">
          Ticket Sales

          <select id="settings-ticket-sales">

            <option
              value="open"
              ${
                savedSettings.ticketSales === "open"
                  ? "selected"
                  : ""
              }
            >
              Open
            </option>

            <option
              value="closed"
              ${
                savedSettings.ticketSales === "closed"
                  ? "selected"
                  : ""
              }
            >
              Closed
            </option>

          </select>
        </label>


        <label class="admin-settings-field">
          Check-in System

          <select id="settings-checkin">

            <option
              value="enabled"
              ${
                savedSettings.checkinEnabled === "enabled"
                  ? "selected"
                  : ""
              }
            >
              Enabled
            </option>

            <option
              value="disabled"
              ${
                savedSettings.checkinEnabled === "disabled"
                  ? "selected"
                  : ""
              }
            >
              Disabled
            </option>

          </select>
        </label>


        <label class="admin-settings-field">
          Maintenance Mode

          <select id="settings-maintenance">

            <option
              value="off"
              ${
                savedSettings.maintenanceMode === "off"
                  ? "selected"
                  : ""
              }
            >
              Off
            </option>

            <option
              value="on"
              ${
                savedSettings.maintenanceMode === "on"
                  ? "selected"
                  : ""
              }
            >
              On
            </option>

          </select>
        </label>


        <label
          class="
            admin-settings-field
            admin-settings-field-wide
          "
        >
          Footer / Internal Note

          <input
            type="text"
            id="settings-footer-note"
            value="${savedSettings.footerNote}"
          />
        </label>


        <div class="admin-settings-actions">

          <button
            type="submit"
            id="save-admin-settings"
          >
            Save Settings
          </button>

          <p id="admin-settings-message"></p>

        </div>

      </form>

    </section>


    <!-- SYSTEM -->

    <section class="admin-panel">

      <div class="admin-panel-head">

        <div>
          <p>SYSTEM</p>
          <h2>Platform status</h2>
        </div>

      </div>


      <div class="admin-ticket-breakdown">

        <div>
          <span>Ticket Sales</span>

          <strong>
            ${
              savedSettings.ticketSales === "open"
                ? "Open"
                : "Closed"
            }
          </strong>

          <small>
            Public checkout
          </small>
        </div>


        <div>
          <span>Check-in</span>

          <strong>
            ${
              savedSettings.checkinEnabled === "enabled"
                ? "Enabled"
                : "Disabled"
            }
          </strong>

          <small>
            Gate operations
          </small>
        </div>


        <div>
          <span>Maintenance</span>

          <strong>
            ${
              savedSettings.maintenanceMode === "on"
                ? "On"
                : "Off"
            }
          </strong>

          <small>
            Website availability
          </small>
        </div>


        <div>
          <span>Currency</span>

          <strong>
            ${savedSettings.currency}
          </strong>

          <small>
            Ticket currency
          </small>
        </div>

      </div>

    </section>
  `;


  const form =
    document.querySelector(
      "#admin-settings-form"
    );


  const message =
    document.querySelector(
      "#admin-settings-message"
    );


  const saveButton =
    document.querySelector(
      "#save-admin-settings"
    );


  form.addEventListener(
    "submit",
    (event) => {

      event.preventDefault();


      const settings = {

        adminName:
          document
            .querySelector(
              "#settings-admin-name"
            )
            .value
            .trim(),

        publicEmail:
          document
            .querySelector(
              "#settings-public-email"
            )
            .value
            .trim(),

        supportPhone:
          document
            .querySelector(
              "#settings-support-phone"
            )
            .value
            .trim(),

        whatsapp:
          document
            .querySelector(
              "#settings-whatsapp"
            )
            .value
            .trim(),

        currency:
          document
            .querySelector(
              "#settings-currency"
            )
            .value,

        ticketSales:
          document
            .querySelector(
              "#settings-ticket-sales"
            )
            .value,

        checkinEnabled:
          document
            .querySelector(
              "#settings-checkin"
            )
            .value,

        maintenanceMode:
          document
            .querySelector(
              "#settings-maintenance"
            )
            .value,

        footerNote:
          document
            .querySelector(
              "#settings-footer-note"
            )
            .value
            .trim(),
      };


      if (!settings.publicEmail) {

        message.textContent =
          "Please enter a contact email.";

        return;
      }


      saveButton.disabled = true;

      saveButton.textContent =
        "Saving...";


      localStorage.setItem(
        "coast-wave-admin-settings",
        JSON.stringify(settings)
      );


      message.textContent =
        "Settings saved successfully.";

      saveButton.textContent =
        "Saved ✓";


      setTimeout(
        () => {
          renderSettings();
        },
        600
      );

    }
  );
}
/* =====================================================
   DASHBOARD PAGE SWITCHING
===================================================== */

const menuButtons =
  document.querySelectorAll(".admin-menu button");

async function openAdminPage(page) {
  // Update active sidebar button
  menuButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  // Render selected dashboard section
  if (page === "overview") {
    renderOverview();
    return;
  }

  if (page === "tickets") {
    await renderTickets();
    return;
  }

  if (page === "orders") {
    await renderOrders();
    return;
  }

if (page === "attendees") {
  await renderAttendees();
  return;
}

if (page === "checkin") {
  await renderCheckin();
  return;
}

if (page === "event") {
  renderEvent();
  return;
}

if (page === "analytics") {
  await renderAnalytics();
  return;
}

  if (page === "settings") {
    renderSettings();
    return;
  }

  // Fallback
  renderOverview();
}


/* =====================================================
   SIDEBAR NAVIGATION
===================================================== */

menuButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const page = button.dataset.page;

    if (!page) return;

    const newHash = `#${page}`;

    // If we're already on this hash,
    // render it immediately.
    if (window.location.hash === newHash) {
      await openAdminPage(page);
      return;
    }

    // Changing the hash triggers the hashchange listener.
    window.location.hash = page;
  });
});


/* =====================================================
   BROWSER BACK / FORWARD
===================================================== */

window.addEventListener("hashchange", async () => {
  const page =
    window.location.hash.replace("#", "") ||
    "overview";

  await openAdminPage(page);
});


/* =====================================================
   LOGOUT
===================================================== */

const logoutButton =
  document.querySelector("#admin-logout");

if (logoutButton) {
  logoutButton.addEventListener(
    "click",
    async () => {
      await supabase.auth.signOut();

      window.location.href = "/admin";
    }
  );
}


/* =====================================================
   INITIAL DASHBOARD PAGE
===================================================== */

const initialPage =
  window.location.hash.replace("#", "") ||
  "overview";

await openAdminPage(initialPage);

}


/* =====================================================
   WATCH LOGIN SESSION
===================================================== */

supabase.auth.onAuthStateChange(
  (event, session) => {
    const path =
      window.location.pathname;

    if (
      event === "SIGNED_OUT" &&
      path.startsWith("/admin/dashboard")
    ) {
      window.location.href = "/admin";
    }
  }
);

