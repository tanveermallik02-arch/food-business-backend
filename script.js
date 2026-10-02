let currentRole = "";

function showOwner() {

    currentRole = "owner";

    document.getElementById("roleScreen").style.display = "none";
    document.getElementById("ownerApp").style.display = "block";
    document.getElementById("riderApp").style.display = "none";
    document.getElementById("logoutBtn").style.display = "block";

    ownerTab("orders");
}


function showRider() {

    currentRole = "rider";

    document.getElementById("roleScreen").style.display = "none";
    document.getElementById("ownerApp").style.display = "none";
    document.getElementById("riderApp").style.display = "block";
    document.getElementById("logoutBtn").style.display = "block";

    riderTab("availableTab");
}


function logout() {

    currentRole = "";

    document.getElementById("roleScreen").style.display = "flex";
    document.getElementById("ownerApp").style.display = "none";
    document.getElementById("riderApp").style.display = "none";
    document.getElementById("logoutBtn").style.display = "none";
}


function ownerTab(tab) {

    document.getElementById("ownerOrders").style.display = "none";
    document.getElementById("ownerMenu").style.display = "none";
    document.getElementById("ownerSales").style.display = "none";

    document.getElementById("ordersTab").classList.remove("active");
    document.getElementById("menuTab").classList.remove("active");
    document.getElementById("salesTab").classList.remove("active");


    if (tab === "orders") {

        document.getElementById("ownerOrders").style.display = "block";
        document.getElementById("ordersTab").classList.add("active");

    }

    if (tab === "menu") {

        document.getElementById("ownerMenu").style.display = "block";
        document.getElementById("menuTab").classList.add("active");

    }

    if (tab === "sales") {

        document.getElementById("ownerSales").style.display = "block";
        document.getElementById("salesTab").classList.add("active");

    }
}


function riderTab(tab) {

    document.getElementById("availableTab").style.display = "none";
    document.getElementById("activeTab").style.display = "none";
    document.getElementById("historyTab").style.display = "none";

    document.getElementById("availableTabBtn").classList.remove("active");
    document.getElementById("activeTabBtn").classList.remove("active");
    document.getElementById("historyTabBtn").classList.remove("active");


    if (tab === "availableTab") {

        document.getElementById("availableTab").style.display = "block";
        document.getElementById("availableTabBtn").classList.add("active");

    }

    if (tab === "activeTab") {

        document.getElementById("activeTab").style.display = "block";
        document.getElementById("activeTabBtn").classList.add("active");

    }

    if (tab === "historyTab") {

        document.getElementById("historyTab").style.display = "block";
        document.getElementById("historyTabBtn").classList.add("active");

    }
}


function acceptOrder() {

    alert("Order accepted successfully!");

    document.getElementById("newOrders").textContent = "2";
    document.getElementById("preparingOrders").textContent = "3";
}


function rejectOrder() {

    alert("Order rejected.");

    document.getElementById("newOrders").textContent = "2";
}


function markReady(button) {

    alert("Order is ready for pickup!");

    button.textContent = "✅ Waiting for Rider";
    button.disabled = true;

    document.getElementById("preparingOrders").textContent = "1";
    document.getElementById("readyOrders").textContent = "2";
}


function acceptDelivery(button) {

    alert("Delivery accepted!");

    button.textContent = "✅ Delivery Accepted";
    button.disabled = true;

    document.getElementById("available").textContent = "2";
    document.getElementById("active").textContent = "2";

    riderTab("activeTab");
}


function pickupOrder() {

    alert("Order picked up successfully!");

    const steps = document.querySelectorAll(".progress-step");

    if (steps.length >= 3) {

        steps[1].classList.add("completed");
        steps[1].querySelector("span").textContent = "✓";

    }
}


function deliverOrder() {

    alert("🎉 Order delivered successfully!");

    document.getElementById("active").textContent = "1";

    let earning =
        document.getElementById("riderToday").textContent;

    earning = parseInt(earning.replace("₹", ""));

    earning = earning + 70;

    document.getElementById("riderToday").textContent =
        "₹" + earning;

    riderTab("historyTab");
}


function addFood() {

    const name = prompt("Food item name:");

    if (!name) {
        return;
    }

    const price = prompt("Food price:");

    if (!price) {
        return;
    }

    alert(
        name +
        " added successfully at ₹" +
        price
    );
}


function editFood(name) {

    const newPrice = prompt(
        "Enter new price for " + name
    );

    if (newPrice) {

        alert(
            name +
            " updated successfully. New price: ₹" +
            newPrice
        );

    }
}


function deleteFood(button) {

    const confirmDelete =
        confirm("Delete this food item?");

    if (confirmDelete) {

        const card = button.closest(".food-card");

        if (card) {
            card.remove();
        }

    }
}


function settings() {

    const restaurantName =
        prompt(
            "Restaurant name:",
            "Tuba Restaurant"
        );

    if (restaurantName) {

        alert(
            "Restaurant settings saved for " +
            restaurantName
        );

    }
}