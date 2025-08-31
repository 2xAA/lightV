/* eslint-disable @typescript-eslint/explicit-function-return-type */
export class UIController {
  constructor() {
    this.resultsBody = null;
    this.emptyState = null;
    this.editModal = null;
    this.currentEditRegion = null;
    this.onRegionEdit = null;
    this.onRegionDelete = null;
  }

  init() {
    this.resultsBody = document.getElementById("results-body");
    this.emptyState = document.getElementById("empty-state");
    this.editModal = document.getElementById("edit-modal");

    this.setupModalEvents();
    this.updateEmptyState();
  }

  setupModalEvents() {
    const modalClose = document.getElementById("modal-close");
    const modalCancel = document.getElementById("modal-cancel");
    const modalSave = document.getElementById("modal-save");

    modalClose.addEventListener("click", () => this.hideEditModal());
    modalCancel.addEventListener("click", () => this.hideEditModal());
    modalSave.addEventListener("click", () => this.saveModalChanges());

    // Close modal when clicking outside
    this.editModal.addEventListener("click", (e) => {
      if (e.target === this.editModal) {
        this.hideEditModal();
      }
    });
  }

  addRegionRow(region) {
    const row = document.createElement("tr");
    row.id = `row-${region.id}`;
    row.innerHTML = this.createRowHTML(region);

    this.resultsBody.appendChild(row);
    this.setupRowEvents(row, region.id);
    this.updateEmptyState();
  }

  createRowHTML(region) {
    const configText = this.getConfigText(region);
    const colorCells = this.getColorCells(region.colors);

    return `
            <td class="region-id">${region.id}</td>
            <td class="region-type">${
              region.type.charAt(0).toUpperCase() + region.type.slice(1)
            }</td>
            <td class="config-text">${configText}</td>
            <td class="color-cells">${colorCells}</td>
            <td class="rgb-values">${this.getRGBText(region.colors)}</td>
            <td class="hex-values">${this.getHexText(region.colors)}</td>
            <td class="action-buttons">
                <button class="btn btn-small btn-secondary edit-btn" data-region="${
                  region.id
                }">Edit</button>
                <button class="btn btn-small btn-danger delete-btn" data-region="${
                  region.id
                }">Delete</button>
            </td>
        `;
  }

  getConfigText(region) {
    const method = (region.config && region.config.method) || "average";
    const methodLabel =
      method === "mode"
        ? "Mode"
        : method === "maxluma"
          ? "Max Luma"
          : "Average";
    switch (region.type) {
      case "area":
        return `1×1 • ${methodLabel}`;
      case "strip":
        return `1×${region.config.count || 3} • ${methodLabel}`;
      case "grid":
        return `${region.config.rows || 2}×${region.config.cols || 3} • ${methodLabel}`;
      default:
        return methodLabel;
    }
  }

  getColorCells(colors) {
    if (!colors || colors.length === 0) {
      return '<div class="color-swatch" style="background: #333;"></div>';
    }

    return colors
      .map(
        (color) =>
          `<div class="color-swatch" style="background: rgb(${color.r}, ${color.g}, ${color.b});"></div>`,
      )
      .join(" ");
  }

  getRGBText(colors) {
    if (!colors || colors.length === 0) return "-";
    return colors
      .map(
        (color) =>
          `rgb(${color.r.toString().padStart(3, "0")}, ${color.g
            .toString()
            .padStart(3, "0")}, ${color.b.toString().padStart(3, "0")})`,
      )
      .join("<br>");
  }

  getHexText(colors) {
    if (!colors || colors.length === 0) return "-";
    return colors.map((color) => color.hex).join("<br>");
  }

  setupRowEvents(row, regionId) {
    const editBtn = row.querySelector(".edit-btn");
    const deleteBtn = row.querySelector(".delete-btn");

    editBtn.addEventListener("click", () => {
      if (this.onRegionEdit) {
        this.onRegionEdit(regionId);
      }
    });

    deleteBtn.addEventListener("click", () => {
      if (this.onRegionDelete) {
        this.onRegionDelete(regionId);
      }
    });

    // Highlight region on row hover
    row.addEventListener("mouseenter", () => {
      row.style.background = "rgba(255,255,255,0.05)";
    });

    row.addEventListener("mouseleave", () => {
      row.style.background = "";
    });
  }

  updateRegionColors(regionId, colors) {
    const row = document.getElementById(`row-${regionId}`);
    if (!row) return;

    const colorCells = row.querySelector(".color-cells");
    const rgbValues = row.querySelector(".rgb-values");
    const hexValues = row.querySelector(".hex-values");

    if (colorCells) colorCells.innerHTML = this.getColorCells(colors);
    if (rgbValues) rgbValues.innerHTML = this.getRGBText(colors);
    if (hexValues) hexValues.innerHTML = this.getHexText(colors);
  }

  updateRegionRow(region) {
    const row = document.getElementById(`row-${region.id}`);
    if (!row) return;

    row.innerHTML = this.createRowHTML(region);
    this.setupRowEvents(row, region.id);
  }

  removeRegionRow(regionId) {
    const row = document.getElementById(`row-${regionId}`);
    if (row) {
      row.remove();
    }
    this.updateEmptyState();
  }

  clearResults() {
    this.resultsBody.innerHTML = "";
    this.updateEmptyState();
  }

  updateEmptyState() {
    const hasRows = this.resultsBody.children.length > 0;
    this.emptyState.style.display = hasRows ? "none" : "block";
    document.getElementById("results-table").style.display = hasRows
      ? "table"
      : "none";
  }

  highlightRow(regionId) {
    // Remove previous highlights
    document.querySelectorAll("#results-table tbody tr").forEach((row) => {
      row.classList.remove("highlighted");
    });

    // Highlight current row
    const row = document.getElementById(`row-${regionId}`);
    if (row) {
      row.classList.add("highlighted");
      setTimeout(() => row.classList.remove("highlighted"), 2000);
    }
  }

  showEditModal(region, onSave) {
    this.currentEditRegion = region;
    this.currentOnSave = onSave;

    const modalTitle = document.getElementById("modal-title");
    const modalControls = document.getElementById("modal-controls");

    modalTitle.textContent = `Edit ${
      region.type.charAt(0).toUpperCase() + region.type.slice(1)
    } Region`;

    // Create controls based on region type
    let controlsHTML = "";
    switch (region.type) {
      case "strip":
        controlsHTML = `
                    <div class="input-row">
                        <label for="modal-strip-count">Number of Cells:</label>
                        <input type="number" id="modal-strip-count" min="2" max="20" value="${
                          region.config.count || 3
                        }" class="number-input">
                    </div>
                `;
        break;
      case "grid":
        controlsHTML = `
                    <div class="input-row">
                        <label for="modal-grid-rows">Rows:</label>
                        <input type="number" id="modal-grid-rows" min="2" max="10" value="${
                          region.config.rows || 2
                        }" class="number-input">
                    </div>
                    <div class="input-row">
                        <label for="modal-grid-cols">Columns:</label>
                        <input type="number" id="modal-grid-cols" min="2" max="10" value="${
                          region.config.cols || 3
                        }" class="number-input">
                    </div>
                `;
        break;
      default:
        controlsHTML = "<p>No configurable options for this region type.</p>";
    }

    const method = (region.config && region.config.method) || "average";
    const methodControls = `
      <div class="input-row">
        <label for="modal-method">Sampling:</label>
        <select id="modal-method" class="number-input">
          <option value="average" ${method === "average" ? "selected" : ""}>Average</option>
          <option value="mode" ${method === "mode" ? "selected" : ""}>Mode (dominant)</option>
          <option value="maxluma" ${method === "maxluma" ? "selected" : ""}>Max luminance</option>
        </select>
      </div>
    `;

    modalControls.innerHTML = methodControls + controlsHTML;

    if (this.editModal && typeof this.editModal.showModal === "function") {
      if (!this.editModal.open) this.editModal.showModal();
    } else if (this.editModal) {
      // Fallback: toggle visibility
      this.editModal.setAttribute("open", "");
    }
  }

  hideEditModal() {
    if (this.editModal && typeof this.editModal.close === "function") {
      this.editModal.close();
    } else if (this.editModal) {
      this.editModal.removeAttribute("open");
    }
    this.currentEditRegion = null;
    this.currentOnSave = null;
  }

  saveModalChanges() {
    if (!this.currentEditRegion || !this.currentOnSave) return;

    const updatedConfig = { ...this.currentEditRegion.config };

    const methodSelect = document.getElementById("modal-method");
    if (methodSelect) {
      updatedConfig.method = methodSelect.value;
    }

    switch (this.currentEditRegion.type) {
      case "strip": {
        const stripCount = document.getElementById("modal-strip-count");
        if (stripCount) {
          updatedConfig.count = parseInt(stripCount.value);
        }
        break;
      }
      case "grid": {
        const gridRows = document.getElementById("modal-grid-rows");
        const gridCols = document.getElementById("modal-grid-cols");
        if (gridRows && gridCols) {
          updatedConfig.rows = parseInt(gridRows.value);
          updatedConfig.cols = parseInt(gridCols.value);
        }
        break;
      }
    }

    this.currentOnSave(updatedConfig);
    this.hideEditModal();
  }
}
