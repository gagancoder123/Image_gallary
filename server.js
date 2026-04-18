const Contact = require("C:\Users\44200\vscode\web\Imagae_Galary_project\contact.js");

app.post("/contact", async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: "All fields are required." });
    }

    try {
        const newContact = new Contact({ name, email, message });
        await newContact.save();

        console.log("New Contact Form Submission:", newContact);
        res.status(200).json({ message: "Thank you for contacting us!" });
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error" });
    }
});
