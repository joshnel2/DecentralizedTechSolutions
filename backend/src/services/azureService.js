const { ComputeManagementClient } = require('@azure/arm-compute');
const { NetworkManagementClient } = require('@azure/arm-network');
const { StorageManagementClient } = require('@azure/arm-storage');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { DefaultAzureCredential } = require('@azure/identity');
const logger = require('./logger');

class AzureService {
  constructor() {
    this.credential = new DefaultAzureCredential();
    this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    
    this.clients = {
      compute: new ComputeManagementClient(this.credential, this.subscriptionId),
      network: new NetworkManagementClient(this.credential, this.subscriptionId),
      storage: new StorageManagementClient(this.credential, this.subscriptionId),
      resources: new ResourceManagementClient(this.credential, this.subscriptionId)
    };
  }

  async scanResources() {
    try {
      const scanResults = {
        timestamp: new Date().toISOString(),
        resources: [],
        securityIssues: [],
        optimizationSuggestions: [],
        complianceResults: []
      };

      // Scan compute resources
      const vms = await this.clients.compute.virtualMachines.listAll();
      for (const vm of vms) {
        const vmDetails = await this.analyzeVM(vm);
        scanResults.resources.push(vmDetails);
        
        if (vmDetails.securityIssues.length > 0) {
          scanResults.securityIssues.push(...vmDetails.securityIssues);
        }
        
        if (vmDetails.optimizationSuggestions.length > 0) {
          scanResults.optimizationSuggestions.push(...vmDetails.optimizationSuggestions);
        }
      }

      // Scan storage accounts
      const storageAccounts = await this.clients.storage.storageAccounts.list();
      for (const account of storageAccounts) {
        const storageDetails = await this.analyzeStorageAccount(account);
        scanResults.resources.push(storageDetails);
        
        if (storageDetails.securityIssues.length > 0) {
          scanResults.securityIssues.push(...storageDetails.securityIssues);
        }
      }

      // Scan network resources
      const networks = await this.clients.network.virtualNetworks.listAll();
      for (const network of networks) {
        const networkDetails = await this.analyzeNetwork(network);
        scanResults.resources.push(networkDetails);
        
        if (networkDetails.securityIssues.length > 0) {
          scanResults.securityIssues.push(...networkDetails.securityIssues);
        }
      }

      return scanResults;

    } catch (error) {
      logger.error(`Azure resource scan failed: ${error.message}`);
      throw error;
    }
  }

  async analyzeVM(vm) {
    const issues = [];
    const suggestions = [];

    // Check VM state
    const vmDetails = await this.clients.compute.virtualMachines.get(
      vm.resourceGroupName, 
      vm.name, 
      { expand: 'instanceView' }
    );

    // Security checks
    if (!vmDetails.osProfile?.linuxConfiguration?.disablePasswordAuthentication) {
      issues.push({
        type: 'security',
        severity: 'high',
        message: 'Password authentication enabled on Linux VM',
        resource: vm.name
      });
    }

    if (!vmDetails.networkProfile?.networkInterfaces?.some(ni => ni.id)) {
      issues.push({
        type: 'network',
        severity: 'medium',
        message: 'VM has no network interface',
        resource: vm.name
      });
    }

    // Optimization checks
    if (vmDetails.hardwareProfile?.vmSize.startsWith('Standard')) {
      const usage = await this.getVMUsage(vm.resourceGroupName, vm.name);
      if (usage && usage.cpuUtilization < 10) {
        suggestions.push({
          type: 'optimization',
          severity: 'low',
          message: 'VM appears underutilized (CPU < 10%)',
          resource: vm.name,
          suggestedAction: 'Consider downsizing VM'
        });
      }
    }

    return {
      type: 'VirtualMachine',
      name: vm.name,
      id: vm.id,
      resourceGroup: vm.resourceGroupName,
      location: vm.location,
      vmSize: vmDetails.hardwareProfile?.vmSize,
      powerState: vmDetails.instanceView?.statuses?.find(s => s.code?.startsWith('PowerState'))?.displayStatus,
      osType: vmDetails.storageProfile?.osDisk?.osType,
      securityIssues: issues,
      optimizationSuggestions: suggestions
    };
  }

  async analyzeStorageAccount(account) {
    const issues = [];

    try {
      const accountDetails = await this.clients.storage.storageAccounts.getProperties(
        account.resourceGroupName,
        account.name
      );

      if (accountDetails.allowBlobPublicAccess) {
        issues.push({
          type: 'security',
          severity: 'high',
          message: 'Storage account allows public blob access',
          resource: account.name
        });
      }

      if (!accountDetails.enableHttpsTrafficOnly) {
        issues.push({
          type: 'security',
          severity: 'high',
          message: 'Storage account does not enforce HTTPS',
          resource: account.name
        });
      }

      return {
        type: 'StorageAccount',
        name: account.name,
        id: account.id,
        resourceGroup: account.resourceGroupName,
        location: account.location,
        sku: accountDetails.sku?.name,
        kind: accountDetails.kind,
        securityIssues: issues,
        optimizationSuggestions: []
      };

    } catch (error) {
      logger.error(`Analyze storage account failed: ${error.message}`);
      return {
        type: 'StorageAccount',
        name: account.name,
        id: account.id,
        resourceGroup: account.resourceGroupName,
        location: account.location,
        error: 'Failed to analyze storage account',
        securityIssues: issues,
        optimizationSuggestions: []
      };
    }
  }

  async analyzeNetwork(network) {
    const issues = [];

    try {
      const networkDetails = await this.clients.network.virtualNetworks.get(
        network.resourceGroupName,
        network.name
      );

      // Check for network security groups
      if (!networkDetails.subnets?.some(subnet => subnet.networkSecurityGroup)) {
        issues.push({
          type: 'security',
          severity: 'medium',
          message: 'Network has subnets without network security groups',
          resource: network.name
        });
      }

      return {
        type: 'VirtualNetwork',
        name: network.name,
        id: network.id,
        resourceGroup: network.resourceGroupName,
        location: network.location,
        addressSpace: networkDetails.addressSpace?.addressPrefixes?.[0],
        subnetCount: networkDetails.subnets?.length || 0,
        securityIssues: issues,
        optimizationSuggestions: []
      };

    } catch (error) {
      logger.error(`Analyze network failed: ${error.message}`);
      return {
        type: 'VirtualNetwork',
        name: network.name,
        id: network.id,
        resourceGroup: network.resourceGroupName,
        location: network.location,
        error: 'Failed to analyze network',
        securityIssues: issues,
        optimizationSuggestions: []
      };
    }
  }

  async getVMUsage(resourceGroup, vmName) {
    try {
      // This is a simplified usage check - in reality you'd use Azure Monitor
      return { cpuUtilization: Math.random() * 100 };
    } catch (error) {
      logger.error(`Get VM usage failed: ${error.message}`);
      return null;
    }
  }

  async saveScanResults(results) {
    try {
      const AzureScan = require('../models/AzureScan');
      const scanRecord = new AzureScan({
        scanResults: results,
        timestamp: new Date(),
        resourceCount: results.resources.length,
        securityIssueCount: results.securityIssues.length
      });

      await scanRecord.save();
      logger.info(`Azure scan results saved: ${scanRecord._id}`);

    } catch (error) {
      logger.error(`Save scan results failed: ${error.message}`);
      throw error;
    }
  }

  async testConnection() {
    try {
      await this.clients.subscriptions.get(this.subscriptionId);
      return true;
    } catch (error) {
      logger.error(`Azure connection test failed: ${error.message}`);
      return false;
    }
  }
}

module.exports = AzureService;