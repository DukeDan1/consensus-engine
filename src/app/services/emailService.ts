import { EmailClient, EmailMessage } from "@azure/communication-email";

export async function sendEmail(to: string, subject: string, htmlContent: string, plainTextContent: string): Promise<any> {
    const message: EmailMessage = {
        senderAddress: "DoNotReply@m.dukedan.uk",
        content: {
            subject,
            plainText: plainTextContent,
            html: htmlContent,
        },
        recipients: {
            to: [
                {
                    address: to,
                }
            ]
        }
    };

    const connectionString = process.env.AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error("AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING is not set");
    }
    
    const client = new EmailClient(connectionString);
    const poller = await client.beginSend(message);
    const response = await poller.pollUntilDone();
    if (response.status !== "Succeeded") {
        throw new Error(`Email sending failed: ${JSON.stringify(response)}`);
    }
    return response;
}