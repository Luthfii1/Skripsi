const getHomePage = (req, res) => {
    const htmlResponse = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>NetPro Endpoint</title>
            <link rel="icon" href="/images/favicon.ico" type="image/x-icon">
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              }

              body {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(to bottom right, #EBF8FF, #BEE3F8);
              }

              .container {
                max-width: 1200px;
                width: 90%;
                margin: 2rem auto;
                background: white;
                border-radius: 1rem;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                display: grid;
                grid-template-columns: 1fr 1fr;
              }

              .branding {
                background: linear-gradient(to bottom right, #2B6CB0, #2C5282);
                padding: 3rem;
                color: white;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                position: relative;
              }

              .branding::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(135deg, rgba(43, 108, 176, 0.9), rgba(44, 82, 130, 0.9));
                z-index: 1;
              }

              .branding-content {
                position: relative;
                z-index: 2;
              }

              .branding h1 {
                font-size: 2.5rem;
                font-weight: bold;
                margin-bottom: 1.5rem;
                letter-spacing: -0.025em;
              }

              .branding p {
                font-size: 1.125rem;
                opacity: 0.9;
                max-width: 80%;
                margin: 0 auto;
                line-height: 1.6;
              }

              .divider {
                width: 50%;
                height: 1px;
                background: rgba(255, 255, 255, 0.4);
                margin: 1.5rem auto;
              }

              .content {
                padding: 3rem;
                display: flex;
                flex-direction: column;
                justify-content: center;
              }

              .content h2 {
                color: #2B6CB0;
                font-size: 1.875rem;
                font-weight: 600;
                margin-bottom: 1rem;
                text-align: center;
              }

              .content p {
                color: #4A5568;
                text-align: center;
                margin-bottom: 2rem;
              }

              .warning {
                background: #FED7D7;
                color: #C53030;
                padding: 1rem;
                border-radius: 0.5rem;
                text-align: center;
                font-weight: 500;
              }

              @media (max-width: 768px) {
                .container {
                  grid-template-columns: 1fr;
                }
                
                .branding {
                  padding: 2rem;
                }
                
                .content {
                  padding: 2rem;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="branding">
                <div class="branding-content">
                  <h1>NetPro</h1>
                  <p>Indonesia's premier platform for monitoring and managing illegal domains</p>
                  <div class="divider"></div>
                  <p>Join us in making Indonesia's internet safer and more secure</p>
                </div>
              </div>
              <div class="content">
                <h2>Welcome to NetPro Endpoint</h2>
                <p>This is a secure endpoint for managing domain monitoring and security operations.</p>
                <div class="warning">
                  Unauthorized access is strictly prohibited!
                </div>
              </div>
            </div>
          </body>
          </html>
      `;
    res.send(htmlResponse);
  };
  
  module.exports = { getHomePage };