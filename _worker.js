export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api") {
      let ipbMemberId, ipbPassHash;
      try {
        if (request.method === "GET") {
          ipbMemberId = url.searchParams.get("ipb_member_id");
          ipbPassHash = url.searchParams.get("ipb_pass_hash");
        } else if (request.method === "POST") {
          const body = await request.json();
          ipbMemberId = body.ipb_member_id;
          ipbPassHash = body.ipb_pass_hash;
        } else if (request.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          });
        } else {
          return new Response("Only GET, POST, and OPTIONS methods are supported", { status: 405 });
        }

        if (!ipbMemberId || !ipbPassHash) {
          return new Response("Missing required parameters: ipb_member_id and ipb_pass_hash", { status: 400 });
        }

        const cookie = `ipb_member_id=${ipbMemberId}; ipb_pass_hash=${ipbPassHash}`;
        const headers = new Headers();
        headers.set("Cookie", cookie);

        const targetUrl = "https://exhentai.org/";
        const uconfigUrl = "https://e-hentai.org/uconfig.php";
        const forumsUrl = "https://forums.e-hentai.org";

        const forumsResponse = await fetch(forumsUrl, { method: "GET", headers });
        const forumsHtml = await forumsResponse.text();

        const banMatch = forumsHtml.match(
          /<div class="errorwrap">\s*<h4>The error returned was:<\/h4>\s*<p>Your account has been temporarily suspended\. This suspension is due to end on (.*?)\.<\/p>/
        );

        if (banMatch) {
          const banEndDate = banMatch[1];

          return new Response(
            JSON.stringify(
              {
                accountStatus: "banned",
                banEndDate: banEndDate,
              },
              null,
              2
            ),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          );
        }

        const response = await fetch(targetUrl, { method: "GET", headers });
        const headersObject = {};
        for (const [key, value] of response.headers.entries()) {
          headersObject[key] = value;
        }

        const uconfigResponse = await fetch(uconfigUrl, { method: "GET", headers });
        if (!uconfigResponse.ok) {
          return new Response("Failed to fetch uconfig.php", { status: uconfigResponse.status });
        }
        const html = await uconfigResponse.text();

        const match = html.match(/<p>You appear to be browsing the site from <strong>(.*?)<\/strong>/);
        const browsingCountry = match ? match[1] : "Unknown";

        return new Response(
          JSON.stringify(
            {
              accountStatus: "Unknown",
              headers: headersObject,
              browsingCountry: browsingCountry,
            },
            null,
            2
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      } catch (err) {
        return new Response(`Error: ${err.message}`, {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      const response = await env.ASSETS.fetch(request);

      return new HTMLRewriter()
        .on("option[data-cloud-run-api]", new SetAPI(env.CLOUD_RUN_API))
        .on("option[data-aws-lambda-api]", new SetAPI(env.AWS_LAMBDA_API))
        .on("option[data-azure-func-api]", new SetAPI(env.AZURE_FUNC_API))
        .transform(response);
    }
    
    return env.ASSETS.fetch(request);
  },
};

class SetAPI {
  constructor(newAPI) {
    this.newAPI = newAPI;
  }

  element(element) {
    if (this.newAPI) {
      element.setAttribute("value", this.newAPI);
      element.removeAttribute("hidden");
    } else {
      element.removeAttribute("value");
    }
  }
}
