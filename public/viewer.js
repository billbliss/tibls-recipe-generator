// --- Cropper.js modal global support ---
let cropper;

function initializeCropper(imageEl) {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  imageEl.style.border = "4px solid lime";
  imageEl.style.background = "black";

  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.contentRect.width > 10) {
        ro.disconnect();
        cropper = new Cropper(imageEl, {
          aspectRatio: 1,
          viewMode: 1,
          autoCropArea: 1,
          responsive: true
        });
      }
    }
  });

  ro.observe(imageEl);
}

// Create cropper modal markup dynamically
const cropperModal = document.createElement("div");
cropperModal.id = "cropper-modal";
Object.assign(cropperModal.style, {
  display: "none",
  position: "fixed",
  top: "0",
  left: "0",
  width: "100%",
  height: "100%",
  backgroundColor: "rgba(0,0,0,0.8)",
  zIndex: "1000",
  justifyContent: "center",
  alignItems: "center",
  flexDirection: "column"
});
cropperModal.innerHTML = `
  <div class="modal-inner">
    <img id="cropper-image" src="" style="display: block; max-width: 80vw; max-height: 80vh;" />
    <div class="modal-buttons">
      <button id="cropper-apply">Apply</button>
      <button id="cropper-cancel">Cancel</button>
      <button id="file-photo">New Photo</button>
    </div>
  </div>
`;
document.body.appendChild(cropperModal);
cropperModal.tabIndex = -1; // make it focusable
cropperModal.focus();       // optional, to force focus

// Add camera/capture button handler for "New Photo" in cropper modal
const filePhotoButton = document.getElementById("file-photo");
filePhotoButton.onclick = () => {
  const cameraInput = document.createElement("input");
  cameraInput.type = "file";
  cameraInput.accept = "image/*";
  cameraInput.capture = "environment";
  cameraInput.style.display = "none";

  cameraInput.onchange = () => {
    if (cameraInput.files?.length) {
      handleFileInput(cameraInput.files);
      // Reload cropper image with the new photo and reinitialize cropper
      const file = cameraInput.files[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = function (e) {
          cropperImage.src = e.target.result;
          cropperImage.onload = () => {
            initializeCropper(cropperImage);
          };
        };
        reader.readAsDataURL(file);
      }
    }
  };

  document.body.appendChild(cameraInput);
  cameraInput.click();
  document.body.removeChild(cameraInput);
};
const cropperImage = document.getElementById('cropper-image');

cropperModal.addEventListener("paste", async (e) => {
  console.log("Cropper modal received paste event");
  const items = e.clipboardData?.items;
  if (items) {
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = function (evt) {
            cropperImage.src = evt.target.result;
            cropperImage.onload = () => {
              initializeCropper(cropperImage);
            };
          };
          reader.readAsDataURL(file);
        }
      }
    }
  }
});

cropperModal.addEventListener("drop", async (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = function (evt) {
      cropperImage.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }
});

cropperModal.addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.querySelectorAll('.edit-button').forEach(button => {
  button.addEventListener('click', () => {
    const image = button.closest('.image-container').querySelector('img');

    if (cropper) {
      cropper.destroy();
      cropper = null;
    }

    cropperImage.onload = () => {
      cropperImage.style.border = "";
      cropperImage.style.background = "";

      const isPlaceholder = image.src.includes("/img/default-image");
      if (isPlaceholder) {
        cropperImage.style.border = "4px dashed lime";
        cropperImage.style.background = "black";
        return; // Don't enable cropping until a real image is pasted
      }

      initializeCropper(cropperImage);

      // (Optional logging/debug)
      setTimeout(() => {
        const parent = cropperImage.offsetParent;
        console.log("cropperImage offsetParent:", parent);
        console.log("offsetWidth:", parent?.offsetWidth, "offsetHeight:", parent?.offsetHeight);
        console.log("image natural size:", cropperImage.naturalWidth, cropperImage.naturalHeight);
        console.log("image client size:", cropperImage.clientWidth, cropperImage.clientHeight);
      }, 100);
    };

    cropperModal.style.display = "flex"; // show modal
    setTimeout(() => cropperModal.focus(), 0); // Ensure paste events are received
    cropperImage.src = ""; // Force reload

    if (image.src.startsWith("data:")) {
      cropperImage.src = image.src; // do not append query param to base64
    } else {
      // Convert remote image to base64 via server route with cache buster
      fetch(`/image/base64?url=${encodeURIComponent(image.src)}&t=${Date.now()}`)
        .then(res => res.json())
        .then(data => {
          cropperImage.src = data.base64;
        })
        .catch(err => {
          console.error("Failed to fetch base64 image:", err);
          alert("Unable to load image for editing.");
          cropperModal.style.display = "none";
        });
    }

    document.getElementById("cropper-apply").onclick = async () => {
      if (!cropper) return;

      const isPlaceholder = image.src.includes("/img/default-image");
      if (isPlaceholder && cropperImage.src.includes("/img/default-image")) {
        alert("Please paste or drop a real image before editing.");
        return;
      }

      const canvas = cropper.getCroppedCanvas({ width: 400, height: 400 });
      const croppedDataUrl = canvas.toDataURL("image/jpeg");
      image.src = croppedDataUrl;
      cropper.destroy();
      cropper = null;
      cropperModal.style.display = "none";

      const recipeCard = button.closest(".recipe-card");
      const recipeId = recipeCard.id.replace("recipe-", "");
      const recipeFilename = recipeCard.getAttribute("data-filename");

      try {
        const result = await fetch("/update-recipe-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ id: recipeId, ogImageUrl: croppedDataUrl, filename: recipeFilename })
        });
        const data = await result.json();
        if (!data.success) {
          console.error("Failed to save updated image:", data);
          alert("Image updated locally, but could not be saved to the cloud.");
        }
      } catch (err) {
        console.error("Error saving updated image:", err);
        alert("Image updated locally, but could not be saved to the cloud.");
      }
    };

    document.getElementById("cropper-cancel").onclick = () => {
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
      cropperModal.style.display = "none";
    };
  });
});

let pastedImageUrl = ""; // If there is an image pasted, this will hold the URL
let uploadedFileType = null; // 'pdf' or 'image'
let uploadedImagesCount = 0;
const MAX_IMAGES = 4;
let selectedFiles = []; // Accumulate multiple photo captures across separate camera invocations

const dropZone = document.getElementById("imagePasteZone");
if (dropZone) dropZone.focus(); // Ensure dropZone is focusable on load for paste

const inputFile = document.getElementById("inputFile"); // If the user uploads a file, this retrieves its value
if (inputFile) {
  inputFile.addEventListener("change", function () {
    handleFileInput(this.files);
  });
}

// Reusable function for handling file input (from file input or camera/capture)
function handleFileInput(files) {
  const preview = document.getElementById("previewContainer");
  const statusMsg = document.getElementById("fileUploadStatus");
  const labelSpan = document.getElementById("uploadFileLabel");
  if (statusMsg) statusMsg.textContent = "";

  const fileArray = Array.from(files);
  selectedFiles.push(...fileArray);

  for (const file of fileArray) {
    if (uploadedFileType === 'pdf') {
      if (statusMsg) statusMsg.textContent = "You can only upload one PDF file at a time.";
      return;
    }
    if (uploadedFileType === 'image' && file.type === 'application/pdf') {
      if (statusMsg) statusMsg.textContent = "You can’t mix images and PDFs.";
      return;
    }
    if (uploadedFileType === null) {
      uploadedFileType = file.type === 'application/pdf' ? 'pdf' : 'image';
    }

    if (file.type.startsWith("image/")) {
      if (uploadedImagesCount >= MAX_IMAGES) {
        if (statusMsg) statusMsg.textContent = "You’ve reached the maximum number of photos to upload.";
        const uploadLabel = document.querySelector('label[for="inputFile"]');
        if (uploadLabel) {
          uploadLabel.removeAttribute('for');
          uploadLabel.style.pointerEvents = 'none';
          uploadLabel.style.color = 'gray';
          uploadLabel.style.textDecoration = 'none';
        }
        return;
      }
      uploadedImagesCount++;
      const reader = new FileReader();
      reader.onload = function (e) {
        const container = document.createElement("div");
        container.style.position = "relative";
        container.style.display = "inline-block";
        container.style.margin = "5px";

        const img = document.createElement("img");
        img.src = e.target.result;
        img.style.maxWidth = "150px";
        img.style.maxHeight = "150px";

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "×";
        removeBtn.style.position = "absolute";
        removeBtn.style.top = "0";
        removeBtn.style.right = "0";
        removeBtn.style.background = "rgba(0,0,0,0.5)";
        removeBtn.style.color = "white";
        removeBtn.style.border = "none";
        removeBtn.style.cursor = "pointer";

        removeBtn.addEventListener("click", () => {
          preview.removeChild(container);
          uploadedImagesCount--;
          if (uploadedImagesCount < MAX_IMAGES) {
            if (labelSpan) labelSpan.textContent = uploadedImagesCount > 0 ? "Upload or Take Another Photo" : "Upload or Take Photo";
            const uploadLabel = document.querySelector('label');
            if (uploadLabel && !uploadLabel.hasAttribute('for')) {
              uploadLabel.setAttribute('for', 'inputFile');
              uploadLabel.style.pointerEvents = 'auto';
              uploadLabel.style.color = 'blue';
              uploadLabel.style.textDecoration = 'underline';
            }
          }
        });

        container.appendChild(img);
        container.appendChild(removeBtn);
        preview.appendChild(container);
      };
      reader.readAsDataURL(file);
    } else if (file.type === "application/pdf") {
      const p = document.createElement("p");
      p.textContent = `Selected PDF: ${file.name}`;
      preview.appendChild(p);
      if (labelSpan && labelSpan.parentElement) {
        labelSpan.parentElement.style.display = 'none';
      }
    } else {
      if (statusMsg) statusMsg.textContent = "Unsupported file type.";
    }
  }

  // Update label after processing files
  if (uploadedFileType === 'image') {
    if (labelSpan && labelSpan.parentElement) {
      labelSpan.parentElement.style.display = '';
    }
    if (uploadedImagesCount < MAX_IMAGES) {
      if (labelSpan) labelSpan.textContent = uploadedImagesCount > 0 ? "Upload or Take Another Photo" : "Upload or Take Photo";
    } else if (uploadedImagesCount >= MAX_IMAGES) {
      if (labelSpan) labelSpan.textContent = "You’ve reached the maximum number of photos to upload.";
      const uploadLabel = document.querySelector('label[for="inputFile"]');
      if (uploadLabel) {
        uploadLabel.removeAttribute('for');
        uploadLabel.style.pointerEvents = 'none';
        uploadLabel.style.color = 'gray';
        uploadLabel.style.textDecoration = 'none';
      }
    }
  }
}

// This handles the form upload submission
// It gathers the input based on the active tab (URL, file, or text),
// and submits it to the server via a POST request to the /webhook endpoint.
// It also handles image uploads and pastes, displaying the image in the drop zone.
// If the upload is successful, it reloads the page to show the new recipe.
// If there is an error, it displays the error message in the status area.
// The status area shows a spinner while the upload is in progress and updates with success or error
// messages after the upload completes.
document.getElementById("uploadForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData();

  const { type, value } = getActiveInput();

  if (!value) {
    alert("Please enter a URL, upload a file, or paste recipe text.");
    return;
  }

  if (type === "url") formData.append("input", value);
  if (type === "file") {
    selectedFiles.forEach(file => formData.append("filename", file));
  }
  if (type === "text") {
    let textInput = value;
    if (pastedImageUrl) {
      textInput = `Use this value for ogImageUrl: ${pastedImageUrl}\n\n${textInput}`;
    }
    formData.append("input", textInput);
  }

  const status = document.getElementById("uploadStatus");
  status.textContent = "Submitting...";
  status.className = "";
  document.getElementById("spinner").style.display = "inline-block";

  try {
    const result = await fetch("/webhook", {
      method: "POST",
      body: formData
    });

    const json = await result.json();
    if (json.viewer) {
      status.innerHTML = `✅ Recipe queued. Reloading...`; 
      status.className = "success";
      setTimeout(() => window.location.reload(), 1000); 
    } else {
      throw new Error(json.error || "Unknown error");
    }
  } catch (err) {
    status.textContent = `❌ Error: ${err.message}`;
    status.className = "error";
  }
  finally {
    document.getElementById("spinner").style.display = "none";
  }
});

// Handle tab switching for URL, file, and text inputs
document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');

    // Show selected tab
    const selected = button.getAttribute('data-tab');
    document.getElementById(`tab-${selected}`).style.display = 'block';
    if (selected === 'text') {
      const dz = document.getElementById('imagePasteZone');
      if (dz) dz.focus();
    }
  });
});

// Based on which tab is active, get the input value
// This function retrieves the input value based on the active tab (URL, file, or text).
// It returns an object with the type of input and its value.
function getActiveInput() {
  const activeTab = document.querySelector('.tab-button.active').getAttribute('data-tab');
  if (activeTab === 'url') return { type: 'url', value: document.getElementById('inputUrl').value };
  if (activeTab === 'file') {
    const files = Array.from(document.getElementById('inputFile').files);
    return { type: 'file', value: files };
  }
  if (activeTab === 'text') return { type: 'text', value: document.getElementById('inputText').value };
}

async function refreshRecipeCard(recipeId, filename) {
  try {
    const result = await fetch(`/recipe-file/${filename}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: recipeId, filename })
    });

    const data = await result.json();
    if (!data.success) throw new Error(data.error || "Unknown error");

    // Re-render the card (minimal logic just for image update)
    const card = document.getElementById(`recipe-${recipeId}`);
    if (!card) return;
    const img = card.querySelector("img");
    if (img && data.recipe?.ogImageUrl) {
      img.src = data.recipe.ogImageUrl;
    }
  } catch (err) {
    console.error("Failed to refresh recipe card:", err);
  }
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted || performance.getEntriesByType("navigation")[0].type === "back_forward") {
    document.querySelectorAll(".recipe-card").forEach(card => {
      const recipeId = card.id.replace("recipe-", "");
      const filename = card.getAttribute("data-filename");
      if (recipeId && filename) {
        refreshRecipeCard(recipeId, filename);
      }
    });
  }
});

// Handle image pasting in the drop zone
async function handleImage(file) {
  const formData = new FormData();
  formData.append("ogImageUpload", file);

  try {
    const response = await fetch("/upload-image", {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    if (!result.url) throw new Error("Image upload failed");

    pastedImageUrl = result.url;

    dropZone.innerHTML = "";
    const img = document.createElement("img");
    img.src = result.url;
    img.style.maxWidth = "300px";
    img.style.maxHeight = "200px";
    dropZone.appendChild(img);
  } catch (err) {
    console.error("Image upload error:", err);
    dropZone.textContent = "❌ Failed to upload image";
  }
}

// Prevent image pasting anywhere from inserting image blobs as DOM elements,
// except allow pasting in the drop zone.
document.addEventListener("paste", (e) => {
  if (cropperModal.style.display === "flex") return; // let modal paste handle it
  const dropZone = document.getElementById("imagePasteZone");
  if (dropZone && dropZone.contains(document.activeElement)) {
    // Handle image paste in drop zone
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault(); // Prevent default paste behavior
            handleImage(file);
            return;
          }
        }
      }
    }
    return;
  }

  // Prevent pasting images in other areas
  // This will stop images from being pasted into text inputs or other elements
  const hasImage = Array.from(e.clipboardData?.items || []).some(item =>
    item.type.startsWith("image/")
  );
  if (hasImage) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);


document.addEventListener("DOMContentLoaded", () => {
  const toggleButton = document.getElementById("sort-toggle");
  const list = document.getElementById("recipe-index");

  if (!toggleButton || !list) return;

  let sortByDate = false;

  function parseDate(str) {
    const match = str.match(/\((\d{1,2}-\w+-\d{4})\)$/);
    return match ? new Date(match[1]) : new Date(0);
  }

  function sortItems() {
    const items = Array.from(list.querySelectorAll("li"));

    items.sort((a, b) => {
      const textA = a.textContent.trim();
      const textB = b.textContent.trim();
      if (sortByDate) {
        return parseDate(textB) - parseDate(textA);
      } else {
        return textA.localeCompare(textB);
      }
    });

    list.innerHTML = "";
    items.forEach(item => list.appendChild(item));
    toggleButton.textContent = sortByDate ? "Sort by Name" : "Sort by Date";
  }

  toggleButton.addEventListener("click", () => {
    sortByDate = !sortByDate;
    sortItems();
  });

  // Initial sort
  sortItems();
});