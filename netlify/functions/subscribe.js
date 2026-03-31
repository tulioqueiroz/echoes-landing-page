// netlify/functions/subscribe.js
// Dual subscribe: Substack (primary) + Brevo (backup)
// Environment variables needed: BREVO_API_KEY, BREVO_LIST_ID
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const { email, firstName } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Email is required." }),
      };
    }

    // ── 1. SUBSTACK (primary) ──
    // Uses the nojs endpoint to subscribe directly as free subscriber
    let substackOk = false;
    try {
      const substackResponse = await fetch(
        "https://www.elvygerez.com/api/v1/free?nojs=true",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Origin: "https://www.elvygerez.com",
            Referer: "https://www.elvygerez.com/",
          },
          body: `email=${encodeURIComponent(email)}&first_name=${encodeURIComponent(firstName || "")}&source=subscribe_page`,
        }
      );
      // Substack returns 200 on success, or redirects
      substackOk = substackResponse.ok || substackResponse.status === 302;
    } catch (substackErr) {
      // Substack failed silently — we still have Brevo as backup
      console.error("Substack subscribe error:", substackErr.message);
    }

    // ── 2. BREVO (backup list) ──
    let brevoOk = false;
    try {
      const brevoResponse = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "api-key": process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          email: email,
          attributes: { FIRSTNAME: firstName || "" },
          listIds: [parseInt(process.env.BREVO_LIST_ID || "5")],
          updateEnabled: true,
        }),
      });
      const brevoData = await brevoResponse.json().catch(() => null);
      brevoOk =
        brevoResponse.ok ||
        brevoResponse.status === 201 ||
        brevoResponse.status === 204 ||
        (brevoData && brevoData.code === "duplicate_parameter");
    } catch (brevoErr) {
      console.error("Brevo subscribe error:", brevoErr.message);
    }

    // Success if at least one worked
    if (substackOk || brevoOk) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          substack: substackOk,
          brevo: brevoOk,
        }),
      };
    }

    // Both failed
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Something went wrong. Please try again.",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error. Please try again." }),
    };
  }
};
