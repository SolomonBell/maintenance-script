/**
 * DocusealService.gs
 * Wrapper around the Docuseal REST API for sending and tracking documents.
 * API key and base URL are read from Script Properties via CONFIG.
 */

var DocusealService = (function () {

  /**
   * Makes an authenticated request to the Docuseal API.
   * @param {string} method - HTTP method.
   * @param {string} path - API path, e.g. '/submissions'.
   * @param {Object} [body] - JSON body for POST/PATCH requests.
   * @returns {Object} Parsed JSON response.
   */
  function request(method, path, body) {
    var options = {
      method: method,
      headers: {
        'X-Auth-Token': CONFIG.DOCUSEAL_API_KEY,
        'Content-Type': 'application/json',
      },
      muteHttpExceptions: true,
    };
    if (body) {
      options.payload = JSON.stringify(body);
    }
    var response = UrlFetchApp.fetch(CONFIG.DOCUSEAL_BASE_URL + path, options);
    return JSON.parse(response.getContentText());
  }

  /**
   * Creates a new submission (sends a document for signing).
   * @param {string} templateId - Docuseal template ID.
   * @param {Object[]} submitters - Array of { email, role } objects.
   * @returns {Object} Submission record.
   */
  function createSubmission(templateId, submitters) {
    return request('POST', '/submissions', {
      template_id: templateId,
      submitters: submitters,
    });
  }

  /**
   * Retrieves a submission by ID.
   * @param {string} submissionId
   * @returns {Object}
   */
  function getSubmission(submissionId) {
    return request('GET', '/submissions/' + submissionId);
  }

  return { createSubmission: createSubmission, getSubmission: getSubmission };
})();
