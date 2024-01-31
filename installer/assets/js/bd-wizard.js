//Wizard Init
let form = $("#wizardForm");

// Custom validation rule
$.validator.addMethod(
  "requireIfChecked",
  function (value, element, params) {
    var checkbox = $("#" + params.checkboxId);
    return (
      !checkbox.is(":checked") || (checkbox.is(":checked") && value !== "")
    );
  },
  "This field is required when the checkbox is checked."
);

form.validate({
  errorPlacement: function errorPlacement(error, element) {
    element.before(error);
  },
  rules: {
    ai_token: {
      requireIfChecked: {
        checkboxId: "enable_chatbot",
      },
    },
    replicate_token: {
      requireIfChecked: {
        checkboxId: "enable_stablediffusion",
      },
    },
    twitch_client_id: {
      requireIfChecked: {
        checkboxId: "enable_twitch",
      },
    },
    twitch_client_secret: {
      requireIfChecked: {
        checkboxId: "enable_twitch",
      },
    },
  },
  messages: {
    ai_token: {
      requireIfChecked:
        "This part of the form is required if you want to enable the AI Chatbot feature.",
    },
    replicate_token: {
      requireIfChecked:
        "This part of the form is required if you want to enable the Stable Diffusion feature.",
    },
    twitch_client_id: {
      requireIfChecked:
        "This part of the form is required if you want to enable the Twitch Stream Notifier feature.",
    },
    twitch_client_secret: {
      requireIfChecked:
        "This part of the form is required if you want to enable the Twitch Stream Notifier feature.",
    },
  },
});

let is_async_step = false;

form.children("#wizard").steps({
  headerTag: "h3",
  bodyTag: "section",
  transitionEffect: "none",
  titleTemplate: "#title#",
  onStepChanging: function (event, currentIndex, newIndex) {
    form.validate().settings.ignore = ":disabled,:hidden";
    return form.valid();
  },
  onFinishing: function (event, currentIndex) {
    form.validate().settings.ignore = ":disabled";
    return form.valid();
  },
  onFinished: function (event, currentIndex) {
    try {
      var formData = JSON.stringify($("#wizardForm").serializeArray()); // Serialize form data

      console.log("formData, ", formData);

      // Ajax request
      $.ajax({
        type: "POST",
        url: "submit_install", // Replace with your server-side script URL
        data: formData,
        contentType: "application/json",
        success: function (response) {
          // Handle success response
          console.log(response);
        },
        error: function (xhr, status, error) {
          // Handle error response
          console.log(error);
        },
      });
      alert(
        "Installation complete! Please restart the bot and refresh the page."
      );
    } catch (e) {
      alert(
        "An error occurred while submitting the form. Please try again, or contact the developer."
      );
    }
  },
});

// Image Modal
var modal = $("#myModal");
var img = $(".imgModal");
var modalImg = $("#img01");
var captionText = $("#caption");

img.click(function () {
  modal.css("display", "block");
  modalImg.attr("src", $(this).attr("src"));
  captionText.html($(this).attr("alt"));
});

var span = $(".close").eq(0);

span.click(function () {
  modal.css("display", "none");
});

$(document).ready(function () {
  // In your Javascript (external .js resource or <script> tag)
  $(".select").select2();
  $("#enable_chatbot").change(function () {
    if ($(this).is(":checked")) {
      $(".chatbot-settings").show(); // Show the buttons
    } else {
      $(".chatbot-settings").hide(); // Hide the buttons
    }
  });

  $("#enable_stablediffusion").change(function () {
    if ($(this).is(":checked")) {
      $(".stable-diffusion-settings").show(); // Show the buttons
    } else {
      $(".stable-diffusion-settings").hide(); // Hide the buttons
    }
  });

  $("#enable_twitch").change(function () {
    if ($(this).is(":checked")) {
      $(".twitch-settings").show(); // Show the buttons
    } else {
      $(".twitch-settings").hide(); // Hide the buttons
    }
  });
});

$(document).ready(function () {
  var textarea = $("#mongodb_uri");
  var timer;
  var hasTextChanged = false;

  textarea.on("input", function () {
    // Clear the previous timer
    clearTimeout(timer);

    $('a[href="#next"]').addClass("hidden");

    $("#mongoErrorLocation").html(
      "<h3 style='padding: 10px 0'>Verifying connection in 5 seconds...</h3>"
    );

    // Set a new timer for 2.5 seconds
    timer = setTimeout(function () {
      if (hasTextChanged) {
        $("#mongodb_uri").attr("disabled", "disabled");
        $("#mongoErrorLocation").html(
          "<h3 style='padding: 10px 0'>Verifying connection...</h3>"
        );
        // Your code to be executed after 5 seconds
        var value = textarea.val();
        console.log("Textarea value changed:", value);
        // Additional actions...
        $.ajax({
          type: "POST",
          url: "/test_mongodb",
          data: JSON.stringify({
            mongodb_uri: $("#mongodb_uri").val(),
          }),
          contentType: "application/json",
          success: async function (data) {
            console.log("Connection verified.");
            $('a[href="#next"]').removeClass("hidden");
            $("#mongoErrorLocation").html($("#mongoSuccessTemplate").html());
            $("#mongodb_uri").attr("disabled", false);
          },
          error: () => {
            console.log("Connection failed.");
            $("#mongoErrorLocation").html($("#mongoErrorTemplate").html());
            $("#mongodb_uri").attr("disabled", false);
            return false;
          },
        });
      }
      hasTextChanged = false;
    }, 5000);

    // Set the flag to indicate that text has changed
    hasTextChanged = true;
  });
});

function generateInviteLink() {
  const client_id = $("#application_id").val();
  const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client_id}&scope=bot&permissions=1099511627775`;
  window.open(inviteLink, "_blank");
}
