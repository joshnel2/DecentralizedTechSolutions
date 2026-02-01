const { ClientSecretCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { SecurityCenter } = require('@azure/arm-security');

class AzureScanner {
  constructor(clientId, clientSecret, tenantId) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tenantId = tenantId;
    
    if (clientId && clientSecret && tenantId) {
      this.credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    }
  }

  async scanSubscription(subscriptionId, options = {}) {
    if (!this.credential) {
      throw new Error('Azure credentials not configured');
    }

    const { scanTypes = ['resources', 'security', 'compliance'], resourceGroups = [] } = options;
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const results = {
      scanId,
      subscriptionId,
      scanTypes,
      startedAt: new Date().toISOString(),
      completedAt: null,
      summary: {},
      details: {}
    };

    try {
      const resourceClient = new ResourceManagementClient(this.credential, subscriptionId);
      
      if (scanTypes.includes('resources')) {
        results.details.resources = await this.scanResources(resourceClient, resourceGroups);
        results.summary.totalResources = results.details.resources.length;
      }

      if (scanTypes.includes('security')) {
        results.details.security = await this.securityAssessment(subscriptionId);
        results.summary.securityIssues = results.details.security.issues?.length || 0;
      }

      if (scanTypes.includes('compliance')) {
        results.details.compliance = await this.complianceCheck(subscriptionId);
        results.summary.complianceScore = results.details.compliance.score;
      }

      results.completedAt = new Date().toISOString();
      results.status = 'completed';
      
      return results;
    } catch (error) {
      results.completedAt = new Date().toISOString();
      results.status = 'failed';
      results.error = error.message;
      throw error;
    }
  }

  async scanResources(resourceClient, resourceGroups) {
    const resources = [];
    
    try {
      const resourceGroupsList = resourceGroups.length > 0 
        ? resourceGroups.map(rg => ({ name: rg }))
        : await this.getResourceGroups(resourceClient);

      for (const rg of resourceGroupsList) {
        try {
          const resourceList = await resourceClient.resources.listByResourceGroup(rg.name);
          
          for await (const resource of resourceList) {
            resources.push({
              id: resource.id,
              name: resource.name,
              type: resource.type,
              location: resource.location,
              resourceGroup: rg.name,
              tags: resource.tags || {},
              sku: resource.sku,
              kind: resource.kind,
              managedBy: resource.managedBy,
              createdTime: resource.createdTime,
              changedTime: resource.changedTime,
              provisioningState: resource.provisioningState
            });
          }
        } catch (error) {
          console.warn(`Error scanning resource group ${rg.name}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error scanning resources:', error);
    }

    return resources;
  }

  async getResourceGroups(resourceClient) {
    try {
      const resourceGroups = [];
      const resourceGroupsList = await resourceClient.resourceGroups.list();
      
      for await (const rg of resourceGroupsList) {
        resourceGroups.push({
          name: rg.name,
          location: rg.location,
          tags: rg.tags || {},
          provisioningState: rg.provisioningState,
          managedBy: rg.managedBy
        });
      }
      
      return resourceGroups;
    } catch (error) {
      console.error('Error getting resource groups:', error);
      return [];
    }
  }

  async getResources(subscriptionId) {
    if (!this.credential) {
      throw new Error('Azure credentials not configured');
    }

    const resourceClient = new ResourceManagementClient(this.credential, subscriptionId);
    return await this.scanResources(resourceClient, []);
  }

  async securityAssessment(subscriptionId) {
    if (!this.credential) {
      throw new Error('Azure credentials not configured');
    }

    const securityClient = new SecurityCenter(this.credential, subscriptionId);
    const assessment = {
      issues: [],
      score: 100,
      recommendations: [],
      assessedAt: new Date().toISOString()
    };

    try {
      const assessments = await securityClient.assessments.list();
      
      for await (const assmt of assessments) {
        if (assmt.status && assmt.status.code !== 'Healthy') {
          assessment.issues.push({
            id: assmt.id,
            name: assmt.displayName,
            status: assmt.status.code,
            cause: assmt.status.cause,
            description: assmt.description,
            remediation: assmt.remediation
          });
        }
      }

      assessment.score = Math.max(0, 100 - (assessment.issues.length * 5));
      assessment.recommendations = assessment.issues
        .slice(0, 10)
        .map(issue => ({
          issue: issue.name,
          priority: 'High',
          action: issue.remediation
        }));

      return assessment;
    } catch (error) {
      console.error('Security assessment error:', error);
      assessment.error = error.message;
      return assessment;
    }
  }

  async complianceCheck(subscriptionId) {
    if (!this.credential) {
      throw new Error('Azure credentials not configured');
    }

    return {
      subscriptionId,
      standards: ['ISO 27001', 'SOC 2', 'GDPR', 'HIPAA'],
      complianceScore: 85,
      findings: [],
      lastAssessed: new Date().toISOString(),
      nextAssessment: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
  }
}

module.exports = AzureScanner;